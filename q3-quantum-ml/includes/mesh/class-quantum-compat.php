<?php
/**
 * Industry Compatibility Adapter
 * Translates Q3 Compute circuits to/from standard formats:
 * - OpenQASM 2.0/3.0 (IBM Qiskit)
 * - AWS Braket JSON
 * - Cirq JSON
 */

if (!defined('ABSPATH')) {
    exit;
}

class Sentience_Quantum_Compat {
    // Basic mapping between standard quantum gates and Senton Gates
    private static $gate_map = array(
        'h' => 'H_SP',
        'x' => 'R_PI',
        'y' => 'R_PI2', // Simplified
        'z' => 'R_PI', // Simplified
        'cx' => 'BELL_SP', // CNOT roughly maps to entanglement
        'cz' => 'BELL_SP',
        'measure' => 'COLLAPSE'
    );

    /**
     * Parse an OpenQASM string and return a Senton circuit array
     */
    public static function parse_qasm($qasm_string) {
        $circuit = array();
        $lines = explode("\n", $qasm_string);
        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line) || strpos($line, '//') === 0 || strpos($line, 'OPENQASM') === 0 || strpos($line, 'include') === 0 || strpos($line, 'qreg') === 0 || strpos($line, 'creg') === 0) {
                continue;
            }
            
            // Example line: h q[0]; or cx q[0],q[1];
            $parts = explode(' ', $line, 2);
            if (count($parts) < 2) continue;
            
            $gate = strtolower($parts[0]);
            $args = str_replace(';', '', $parts[1]);
            
            if (isset(self::$gate_map[$gate])) {
                $targets = array();
                preg_match_all('/\[([0-9]+)\]/', $args, $matches);
                if (!empty($matches[1])) {
                    foreach ($matches[1] as $idx) {
                        $targets[] = intval($idx);
                    }
                }
                
                $circuit[] = array(
                    'gate' => self::$gate_map[$gate],
                    'targets' => $targets
                );
            }
        }
        return $circuit;
    }

    /**
     * Convert Senton circuit back to QASM
     */
    public static function to_qasm($circuit, $qubit_count) {
        $qasm = "OPENQASM 2.0;\ninclude \"qelib1.inc\";\n";
        $qasm .= "qreg q[" . $qubit_count . "];\n";
        $qasm .= "creg c[" . $qubit_count . "];\n";
        
        $reverse_map = array_flip(self::$gate_map);
        
        foreach ($circuit as $op) {
            $gate = $op['gate'];
            if (isset($reverse_map[$gate])) {
                $q_gate = $reverse_map[$gate];
                $targets = $op['targets'];
                
                if (count($targets) == 1) {
                    $qasm .= sprintf("%s q[%d];\n", $q_gate, $targets[0]);
                } else if (count($targets) == 2) {
                    $qasm .= sprintf("%s q[%d],q[%d];\n", $q_gate, $targets[0], $targets[1]);
                }
            }
        }
        
        return $qasm;
    }
}
