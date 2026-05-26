/**
 * QuantumFlow API - JavaScript REST Interface
 * 
 * Workflow orchestration: chain Lambda functions, create pipelines,
 * manage complex quantum computations with state machines.
 */

// =========================================================================
// CONSTANTS
// =========================================================================

const WORKFLOW_STATES = {
    PENDING: 'pending',
    RUNNING: 'running',
    COMPLETED: 'completed',
    FAILED: 'failed',
    PAUSED: 'paused'
};

const STEP_TYPES = {
    LAMBDA: 'lambda',
    CONDITION: 'condition',
    PARALLEL: 'parallel',
    WAIT: 'wait',
    CHOICE: 'choice'
};

// In-memory stores
let workflows = new Map();
let executions = [];
let templates = new Map();

let workflowIdCounter = 0;
let executionIdCounter = 0;
let templateIdCounter = 0;

// =========================================================================
// WORKFLOW DEFINITIONS
// =========================================================================

function createWorkflow(name, steps = [], options = {}) {
    const id = `wf-${++workflowIdCounter}`;

    const workflow = {
        id,
        name,
        steps,
        timeout: options.timeout || 300000,  // 5 min default
        retryPolicy: options.retryPolicy || { maxRetries: 3, backoff: 'exponential' },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        executionCount: 0,
        successCount: 0,
        failureCount: 0
    };

    workflows.set(id, workflow);
    console.log(`[QFlow] 🔄 Workflow created: ${name} (${steps.length} steps)`);

    return { success: true, workflow };
}

function getWorkflow(workflowId) {
    return workflows.get(workflowId) || null;
}

function listWorkflows() {
    return Array.from(workflows.values());
}

function updateWorkflow(workflowId, updates) {
    const wf = workflows.get(workflowId);
    if (!wf) return { error: 'Workflow not found' };

    if (updates.steps) wf.steps = updates.steps;
    if (updates.name) wf.name = updates.name;
    if (updates.timeout) wf.timeout = updates.timeout;
    wf.updatedAt = Date.now();

    return { success: true, workflow: wf };
}

function deleteWorkflow(workflowId) {
    if (!workflows.has(workflowId)) return { error: 'Workflow not found' };
    workflows.delete(workflowId);
    return { success: true, deleted: workflowId };
}

// =========================================================================
// EXECUTION
// =========================================================================

function executeWorkflow(workflowId, input = {}) {
    const wf = workflows.get(workflowId);
    if (!wf) return { error: 'Workflow not found' };

    const execId = `exec-${++executionIdCounter}`;
    const startTime = Date.now();

    const execution = {
        id: execId,
        workflowId,
        workflowName: wf.name,
        input,
        state: WORKFLOW_STATES.RUNNING,
        currentStep: 0,
        stepResults: [],
        startTime,
        endTime: null,
        duration: null,
        output: null,
        error: null
    };

    // Simulate step execution
    const results = [];
    let currentOutput = input;
    let failed = false;

    for (let i = 0; i < wf.steps.length; i++) {
        const step = wf.steps[i];
        const stepStart = Date.now();

        // Simulate step processing
        const stepResult = {
            stepIndex: i,
            stepType: step.type || 'lambda',
            input: currentOutput,
            output: { ...currentOutput, [`step${i}`]: `result-${i}` },
            duration: Math.random() * 100 + 50,
            success: Math.random() > 0.05  // 95% success rate
        };

        results.push(stepResult);

        if (!stepResult.success) {
            failed = true;
            execution.error = `Step ${i} failed`;
            break;
        }

        currentOutput = stepResult.output;
    }

    execution.stepResults = results;
    execution.endTime = Date.now();
    execution.duration = execution.endTime - startTime;
    execution.state = failed ? WORKFLOW_STATES.FAILED : WORKFLOW_STATES.COMPLETED;
    execution.output = failed ? null : currentOutput;

    executions.push(execution);

    wf.executionCount++;
    if (failed) wf.failureCount++;
    else wf.successCount++;

    console.log(`[QFlow] ⚡ Workflow executed: ${wf.name} (${execution.state})`);

    return { success: true, execution };
}

function getExecution(executionId) {
    return executions.find(e => e.id === executionId) || null;
}

function listExecutions(workflowId = null, limit = 50) {
    let execs = executions;
    if (workflowId) execs = execs.filter(e => e.workflowId === workflowId);
    return execs.slice(-limit).reverse();
}

function cancelExecution(executionId) {
    const exec = executions.find(e => e.id === executionId);
    if (!exec) return { error: 'Execution not found' };
    if (exec.state !== WORKFLOW_STATES.RUNNING) {
        return { error: `Cannot cancel execution in state: ${exec.state}` };
    }

    exec.state = WORKFLOW_STATES.FAILED;
    exec.error = 'Cancelled by user';
    exec.endTime = Date.now();

    return { success: true, execution: exec };
}

// =========================================================================
// TEMPLATES
// =========================================================================

function createTemplate(name, description, steps) {
    const id = `tpl-${++templateIdCounter}`;

    const template = {
        id,
        name,
        description,
        steps,
        createdAt: Date.now(),
        usageCount: 0
    };

    templates.set(id, template);
    return { success: true, template };
}

function listTemplates() {
    return Array.from(templates.values());
}

function createWorkflowFromTemplate(templateId, name) {
    const template = templates.get(templateId);
    if (!template) return { error: 'Template not found' };

    template.usageCount++;
    return createWorkflow(name, [...template.steps]);
}

// =========================================================================
// STATS
// =========================================================================

function getFlowStats() {
    const allExecs = executions;
    const completed = allExecs.filter(e => e.state === WORKFLOW_STATES.COMPLETED);
    const failed = allExecs.filter(e => e.state === WORKFLOW_STATES.FAILED);

    const avgDuration = completed.length > 0
        ? completed.reduce((sum, e) => sum + e.duration, 0) / completed.length
        : 0;

    return {
        workflows: {
            total: workflows.size,
            active: Array.from(workflows.values()).filter(w => w.executionCount > 0).length
        },
        executions: {
            total: allExecs.length,
            completed: completed.length,
            failed: failed.length,
            running: allExecs.filter(e => e.state === WORKFLOW_STATES.RUNNING).length,
            successRate: allExecs.length > 0
                ? (completed.length / allExecs.length * 100).toFixed(1) + '%'
                : '0%'
        },
        performance: {
            avgDuration: avgDuration.toFixed(0) + 'ms',
            totalStepsExecuted: allExecs.reduce((sum, e) => sum + e.stepResults.length, 0)
        },
        templates: templates.size
    };
}

// =========================================================================
// EXPORTS
// =========================================================================

module.exports = {
    WORKFLOW_STATES,
    STEP_TYPES,

    createWorkflow,
    getWorkflow,
    listWorkflows,
    updateWorkflow,
    deleteWorkflow,

    executeWorkflow,
    getExecution,
    listExecutions,
    cancelExecution,

    createTemplate,
    listTemplates,
    createWorkflowFromTemplate,

    getFlowStats
};
