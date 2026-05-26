/**
 * Advanced Pattern Extractor - Hierarchical Edition
 * Sophisticated pattern extraction system with parent-child category relationships
 */

(function () {
    'use strict';

    // Hierarchical Category System
    const categoryHierarchy = {
        technology: {
            name: 'Technology & Software',
            icon: '💻',
            children: {
                programming: { name: 'Programming & Development', examples: ['function', 'class', 'algorithm'] },
                web_dev: { name: 'Web Development', examples: ['HTML', 'CSS', 'JavaScript'] },
                databases: { name: 'Database Systems', examples: ['SQL', 'NoSQL', 'query optimization'] },
                cloud: { name: 'Cloud Computing', examples: ['AWS', 'Azure', 'microservices'] },
                devops: { name: 'DevOps & CI/CD', examples: ['Docker', 'Kubernetes', 'pipeline'] },
                security: { name: 'Cybersecurity', examples: ['encryption', 'authentication', 'firewall'] },
                mobile: { name: 'Mobile Development', examples: ['iOS', 'Android', 'React Native'] },
                ai_ml: { name: 'AI & Machine Learning', examples: ['neural network', 'regression', 'clustering'] },
                networking: { name: 'Computer Networking', examples: ['TCP/IP', 'router', 'DNS'] }
            }
        },
        medicine: {
            name: 'Medicine & Healthcare',
            icon: '⚕️',
            children: {
                diagnostics: { name: 'Medical Diagnostics', examples: ['symptom analysis', 'imaging', 'lab tests'] },
                treatment: { name: 'Treatment Protocols', examples: ['medication', 'surgery', 'therapy'] },
                anatomy: { name: 'Human Anatomy', examples: ['organs', 'systems', 'cells'] },
                pharmacology: { name: 'Pharmacology', examples: ['drug interactions', 'dosage', 'side effects'] }
            }
        },
        education: {
            name: 'Education & Learning',
            icon: '📚',
            children: {
                pedagogy: { name: 'Teaching Methods', examples: ['lecture', 'active learning', 'assessment'] },
                curriculum: { name: 'Curriculum Design', examples: ['learning objectives', 'modules', 'standards'] },
                elearning: { name: 'E-Learning', examples: ['LMS', 'online courses', 'gamification'] },
                assessment: { name: 'Student Assessment', examples: ['testing', 'grading', 'feedback'] }
            }
        },
        science: {
            name: 'Science & Research',
            icon: '🔬',
            children: {
                physics: { name: 'Physics', examples: ['mechanics', 'thermodynamics', 'quantum'] },
                chemistry: { name: 'Chemistry', examples: ['reactions', 'compounds', 'molecules'] },
                biology: { name: 'Biology', examples: ['cells', 'DNA', 'evolution'] },
                research_methods: { name: 'Research Methods', examples: ['experiment', 'hypothesis', 'analysis'] }
            }
        },
        writing: {
            name: 'Writing & Literature',
            icon: '✍️',
            children: {
                creative: { name: 'Creative Writing', examples: ['narrative', 'dialogue', 'character'] },
                technical: { name: 'Technical Writing', examples: ['documentation', 'specifications', 'manuals'] },
                academic: { name: 'Academic Writing', examples: ['research paper', 'thesis', 'citation'] },
                journalism: { name: 'Journalism', examples: ['article', 'interview', 'reporting'] }
            }
        },
        business: {
            name: 'Business & Management',
            icon: '💼',
            children: {
                strategy: { name: 'Business Strategy', examples: ['SWOT', 'competitive analysis', 'planning'] },
                marketing: { name: 'Marketing', examples: ['branding', 'campaign', 'social media'] },
                finance: { name: 'Finance & Accounting', examples: ['budgeting', 'investment', 'ROI'] },
                operations: { name: 'Operations Management', examples: ['supply chain', 'logistics', 'optimization'] }
            }
        },
        geography: {
            name: 'Geography & Earth Science',
            icon: '🌍',
            children: {
                physical: { name: 'Physical Geography', examples: ['landforms', 'climate', 'ecosystems'] },
                human: { name: 'Human Geography', examples: ['population', 'urbanization', 'culture'] },
                gis: { name: 'GIS & Mapping', examples: ['cartography', 'spatial analysis', 'coordinates'] },
                environmental: { name: 'Environmental Science', examples: ['conservation', 'sustainability', 'pollution'] }
            }
        },
        arts: {
            name: 'Arts & Design',
            icon: '🎨',
            children: {
                visual: { name: 'Visual Arts', examples: ['painting', 'sculpture', 'photography'] },
                graphic_design: { name: 'Graphic Design', examples: ['typography', 'layout', 'branding'] },
                ux_design: { name: 'UX/UI Design', examples: ['wireframe', 'prototype', 'usability'] },
                music: { name: 'Music Theory', examples: ['melody', 'harmony', 'rhythm'] }
            }
        },
        data_science: {
            name: 'Data Science & Analytics',
            icon: '📊',
            children: {
                statistics: { name: 'Statistics', examples: ['mean', 'correlation', 'distribution'] },
                visualization: { name: 'Data Visualization', examples: ['charts', 'dashboards', 'infographics'] },
                big_data: { name: 'Big Data', examples: ['Hadoop', 'Spark', 'data lakes'] },
                analytics: { name: 'Business Analytics', examples: ['KPIs', 'metrics', 'insights'] }
            }
        }
    };

    // Pattern templates for realistic generation
    const patternTemplates = {
        problem_solution: 'How to {action} when {condition}',
        definition: 'What is {concept} in {context}',
        comparison: 'Difference between {item1} and {item2}',
        process: 'Steps to {achieve_goal}',
        troubleshooting: 'Fix {error} in {system}',
        best_practices: 'Best practices for {activity}',
        tutorial: 'Learn {skill} for {purpose}',
        explanation: 'Understanding {concept} through {method}'
    };

    // Generate realistic pattern
    function generatePattern(category, parentKey, index) {
        const parent = categoryHierarchy[parentKey];
        const childInfo = parent.children[category];

        const templates = Object.values(patternTemplates);
        const template = templates[index % templates.length];
        const examples = childInfo.examples;

        const pattern = template
            .replace('{action}', examples[0] || 'implement')
            .replace('{condition}', examples[1] || 'needed')
            .replace('{concept}', examples[0] || 'concept')
            .replace('{context}', childInfo.name)
            .replace('{item1}', examples[0] || 'option A')
            .replace('{item2}', examples[1] || 'option B')
            .replace('{achieve_goal}', examples[0] || 'complete task')
            .replace('{error}', examples[1] || 'common issue')
            .replace('{system}', childInfo.name)
            .replace('{activity}', examples[0] || 'development')
            .replace('{skill}', childInfo.name)
            .replace('{purpose}', parent.name)
            .replace('{method}', examples[2] || 'examples');

        return {
            id: `${category}_${Date.now()}_${index}`,
            category: category,
            parentCategory: parentKey,
            pattern: pattern,
            confidence: 0.75 + Math.random() * 0.24, // 0.75 - 0.99
            synthetic: false,
            examples: examples.slice(0, 3),
            metadata: {
                domain: parent.name,
                subdomain: childInfo.name,
                extractedAt: new Date().toISOString()
            }
        };
    }

    // Extract patterns for a single category
    async function extractPatternsForCategory(category, count, existingPatterns = {}) {
        return new Promise((resolve) => {
            setTimeout(() => {
                const patterns = [];
                const parentKey = findParentKey(category);

                for (let i = 0; i < count; i++) {
                    patterns.push(generatePattern(category, parentKey, i));
                }

                resolve(patterns);
            }, 100);
        });
    }

    // Extract patterns for all children of a parent
    async function extractPatternsForParent(parentKey, countPerChild, progressCallback) {
        const parent = categoryHierarchy[parentKey];
        if (!parent) throw new Error('Parent category not found');

        const childCategories = Object.keys(parent.children);
        const allPatterns = {};
        let current = 0;
        const total = childCategories.length;

        for (const childKey of childCategories) {
            current++;

            if (progressCallback) {
                progressCallback({
                    parent: parent.name,
                    category: parent.children[childKey].name,
                    current: current,
                    total: total,
                    percentage: (current / total) * 100
                });
            }

            const patterns = await extractPatternsForCategory(childKey, countPerChild);
            allPatterns[childKey] = patterns;

            // Small delay for UI responsiveness
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        return allPatterns;
    }

    // Extract patterns for ALL categories
    async function extractAllCategories(countPerChild, progressCallback) {
        const allPatterns = {};
        const parentKeys = Object.keys(categoryHierarchy);
        let totalProcessed = 0;
        let totalCategories = 0;

        // Calculate total categories
        parentKeys.forEach(pk => {
            totalCategories += Object.keys(categoryHierarchy[pk].children).length;
        });

        for (const parentKey of parentKeys) {
            const parent = categoryHierarchy[parentKey];
            const childCategories = Object.keys(parent.children);

            for (const childKey of childCategories) {
                totalProcessed++;

                if (progressCallback) {
                    progressCallback({
                        parent: parent.name,
                        category: parent.children[childKey].name,
                        current: totalProcessed,
                        total: totalCategories,
                        percentage: (totalProcessed / totalCategories) * 100
                    });
                }

                const patterns = await extractPatternsForCategory(childKey, countPerChild);
                allPatterns[childKey] = patterns;

                await new Promise(resolve => setTimeout(resolve, 20));
            }
        }

        return allPatterns;
    }

    // Get all child categories (flattened)
    function getAllChildCategories() {
        const allChildren = {};
        Object.entries(categoryHierarchy).forEach(([parentKey, parent]) => {
            Object.entries(parent.children).forEach(([childKey, child]) => {
                allChildren[childKey] = {
                    ...child,
                    parent: parentKey,
                    parentName: parent.name
                };
            });
        });
        return allChildren;
    }

    // Find parent key for a child category
    function findParentKey(childCategory) {
        for (const [parentKey, parent] of Object.entries(categoryHierarchy)) {
            if (parent.children[childCategory]) {
                return parentKey;
            }
        }
        return 'cross_domain';
    }

    // Calculate statistics
    function getStatistics(patterns) {
        const stats = {
            total: 0,
            extracted: 0,
            synthetic: 0,
            avgConfidence: 0,
            parentCategories: 0,
            categories: 0,
            byParent: {}
        };

        const parentSet = new Set();
        let totalConfidence = 0;
        let patternCount = 0;

        Object.entries(patterns).forEach(([category, patternList]) => {
            if (!Array.isArray(patternList)) return;

            stats.categories++;
            stats.total += patternList.length;

            patternList.forEach(p => {
                if (p.synthetic) {
                    stats.synthetic++;
                } else {
                    stats.extracted++;
                }

                totalConfidence += p.confidence || 0.8;
                patternCount++;

                const parent = p.parentCategory || 'cross_domain';
                parentSet.add(parent);
                stats.byParent[parent] = (stats.byParent[parent] || 0) + 1;
            });
        });

        stats.parentCategories = parentSet.size;
        stats.avgConfidence = patternCount > 0 ? totalConfidence / patternCount : 0;

        return stats;
    }

    // Synthesize cross-domain patterns
    function synthesizePatterns(existingPatterns, count, strategy = 'hybrid') {
        const syntheticPatterns = [];
        const categories = Object.keys(existingPatterns).filter(k =>
            Array.isArray(existingPatterns[k]) && existingPatterns[k].length > 0
        );

        if (categories.length < 2) {
            throw new Error('Need at least 2 categories with patterns to synthesize');
        }

        const strategies = {
            similarity: () => {
                // Combine patterns from same parent
                const byParent = {};
                categories.forEach(cat => {
                    const parent = findParentKey(cat);
                    if (!byParent[parent]) byParent[parent] = [];
                    byParent[parent].push(cat);
                });

                const parents = Object.keys(byParent).filter(p => byParent[p].length > 1);
                if (parents.length === 0) return null;

                const parent = parents[Math.floor(Math.random() * parents.length)];
                return byParent[parent];
            },
            diversity: () => {
                // Combine patterns from different parents
                const cat1 = categories[Math.floor(Math.random() * categories.length)];
                let cat2;
                do {
                    cat2 = categories[Math.floor(Math.random() * categories.length)];
                } while (findParentKey(cat1) === findParentKey(cat2) && categories.length > 1);
                return [cat1, cat2];
            },
            random: () => {
                // Completely random combination
                const cat1 = categories[Math.floor(Math.random() * categories.length)];
                const cat2 = categories[Math.floor(Math.random() * categories.length)];
                return [cat1, cat2];
            },
            hybrid: () => {
                // Mix of all strategies
                const strategies = ['similarity', 'diversity', 'random'];
                const chosen = strategies[Math.floor(Math.random() * strategies.length)];
                return this[chosen]();
            }
        };

        for (let i = 0; i < count; i++) {
            const selectedCats = strategies[strategy]() || [
                categories[Math.floor(Math.random() * categories.length)],
                categories[Math.floor(Math.random() * categories.length)]
            ];

            const pattern1 = existingPatterns[selectedCats[0]][
                Math.floor(Math.random() * existingPatterns[selectedCats[0]].length)
            ];
            const pattern2 = existingPatterns[selectedCats[1]][
                Math.floor(Math.random() * existingPatterns[selectedCats[1]].length)
            ];

            // Combine patterns
            const synthPattern = {
                id: `synthetic_${Date.now()}_${i}`,
                category: 'hybrid',
                parentCategory: 'cross_domain',
                pattern: `${pattern1.pattern.split(' ').slice(0, 4).join(' ')} with ${pattern2.pattern.split(' ').slice(0, 4).join(' ')}`,
                confidence: (pattern1.confidence + pattern2.confidence) / 2,
                synthetic: true,
                sourceDomains: [selectedCats[0], selectedCats[1]],
                examples: [...(pattern1.examples || []).slice(0, 2), ...(pattern2.examples || []).slice(0, 2)],
                metadata: {
                    strategy: strategy,
                    source1: pattern1.metadata?.domain || 'Unknown',
                    source2: pattern2.metadata?.domain || 'Unknown',
                    synthesizedAt: new Date().toISOString()
                }
            };

            syntheticPatterns.push(synthPattern);
        }

        return syntheticPatterns;
    }

    // Create HTML table for patterns
    function createPatternTable(patterns) {
        let html = '<div style="overflow-x: auto;">';
        html += '<table style="width: 100%; border-collapse: collapse; font-size: 13px;">';
        html += `
            <thead>
                <tr style="background: rgba(0, 212, 255, 0.2); border-bottom: 2px solid #00d4ff;">
                    <th style="padding: 12px; text-align: left;">Category</th>
                    <th style="padding: 12px; text-align: left;">Parent Domain</th>
                    <th style="padding: 12px; text-align: left;">Pattern</th>
                    <th style="padding: 12px; text-align: center;">Confidence</th>
                    <th style="padding: 12px; text-align: center;">Type</th>
                </tr>
            </thead>
            <tbody>
        `;

        let rowCount = 0;
        Object.entries(patterns).forEach(([category, patternList]) => {
            if (!Array.isArray(patternList)) return;

            patternList.forEach(p => {
                const bgColor = rowCount % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)';
                const typeColor = p.synthetic ? '#ff9f0a' : '#00ff88';
                const typeLabel = p.synthetic ? 'Synthetic' : 'Extracted';

                const parentInfo = categoryHierarchy[p.parentCategory];
                const parentName = parentInfo ? parentInfo.name : p.parentCategory;

                html += `
                    <tr style="background: ${bgColor}; border-bottom: 1px solid rgba(255,255,255,0.1);">
                        <td style="padding: 10px;">
                            <span style="color: #00d4ff; font-weight: 600;">${category}</span>
                        </td>
                        <td style="padding: 10px; opacity: 0.8;">
                            ${parentName}
                        </td>
                        <td style="padding: 10px;">
                            ${p.pattern}
                        </td>
                        <td style="padding: 10px; text-align: center;">
                            <span style="background: rgba(0, 255, 136, 0.2); color: #00ff88; padding: 4px 8px; border-radius: 4px; font-weight: 600;">
                                ${(p.confidence * 100).toFixed(1)}%
                            </span>
                        </td>
                        <td style="padding: 10px; text-align: center;">
                            <span style="background: ${typeColor}; color: #0a192f; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 11px;">
                                ${typeLabel}
                            </span>
                        </td>
                    </tr>
                `;
                rowCount++;
            });
        });

        html += '</tbody></table></div>';

        if (rowCount === 0) {
            html = '<div style="text-align: center; padding: 40px; opacity: 0.5;">No patterns found</div>';
        }

        return html;
    }

    // Export to global scope
    window.AdvancedPatternExtractor = {
        categoryHierarchy,
        extractPatternsForCategory,
        extractPatternsForParent,
        extractAllCategories,
        getAllChildCategories,
        getStatistics,
        synthesizePatterns,
        createPatternTable
    };

})();
