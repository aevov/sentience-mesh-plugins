<?php
/**
 * DataVault Integrity System
 * 
 * Handles checksums, parity, and data recovery.
 * 
 * @package Q3_DataVault
 */

if (!defined('ABSPATH')) exit;

class Q3_DataVault_Integrity {
    
    /**
     * Calculate checksum of data
     */
    public function checksum($data) {
        // Use xxHash128 if available (fastest)
        if (function_exists('hash') && in_array('xxh128', hash_algos())) {
            return 'xxh:' . hash('xxh128', $data);
        }
        
        // Fallback to SHA256
        return 'sha:' . hash('sha256', $data);
    }
    
    /**
     * Verify checksum
     */
    public function verify($data, $checksum) {
        $calculated = $this->checksum($data);
        return hash_equals($checksum, $calculated);
    }
    
    /**
     * Generate parity data for error recovery
     * Uses XOR parity - can recover 1 lost chunk per group
     */
    public function generate_parity($chunks, $group_size = 4) {
        $parity_groups = [];
        $chunk_count = count($chunks);
        
        for ($g = 0; $g < $chunk_count; $g += $group_size) {
            $group_chunks = array_slice($chunks, $g, $group_size, true);
            $group_indices = array_keys($group_chunks);
            
            if (count($group_chunks) < 2) {
                continue; // Need at least 2 chunks for parity
            }
            
            // Find max length in group
            $max_len = 0;
            foreach ($group_chunks as $chunk) {
                $max_len = max($max_len, strlen($chunk));
            }
            
            // Calculate XOR parity
            $parity = str_repeat("\0", $max_len);
            foreach ($group_chunks as $chunk) {
                $padded = str_pad($chunk, $max_len, "\0");
                $parity = $this->xor_strings($parity, $padded);
            }
            
            $parity_groups[] = [
                'indices' => $group_indices,
                'parity' => base64_encode(gzencode($parity, 9)),
                'checksum' => $this->checksum($parity),
                'max_length' => $max_len
            ];
        }
        
        return $parity_groups;
    }
    
    /**
     * Recover a corrupted chunk using parity
     */
    public function recover_chunk($chunks, $corrupted_index, $parity_groups) {
        // Find the parity group containing this chunk
        $group = null;
        foreach ($parity_groups as $pg) {
            if (in_array($corrupted_index, $pg['indices'])) {
                $group = $pg;
                break;
            }
        }
        
        if (!$group) {
            return [
                'success' => false,
                'error' => 'No parity group found for chunk ' . $corrupted_index
            ];
        }
        
        // Count corrupted chunks in this group
        $group_chunks = [];
        $corrupted_in_group = [];
        
        foreach ($group['indices'] as $idx) {
            if (!isset($chunks[$idx]) || $chunks[$idx] === null) {
                $corrupted_in_group[] = $idx;
            } else {
                $group_chunks[$idx] = $chunks[$idx];
            }
        }
        
        // Can only recover 1 chunk per group
        if (count($corrupted_in_group) !== 1) {
            return [
                'success' => false,
                'error' => 'Cannot recover - ' . count($corrupted_in_group) . ' chunks corrupted in group'
            ];
        }
        
        // Decode parity
        $parity = gzdecode(base64_decode($group['parity']));
        
        if ($parity === false) {
            return [
                'success' => false,
                'error' => 'Failed to decode parity data'
            ];
        }
        
        // Verify parity checksum
        if (!$this->verify($parity, $group['checksum'])) {
            return [
                'success' => false,
                'error' => 'Parity checksum verification failed'
            ];
        }
        
        // Recover: XOR parity with all good chunks
        $max_len = $group['max_length'];
        $recovered = $parity;
        
        foreach ($group_chunks as $chunk) {
            $padded = str_pad($chunk, $max_len, "\0");
            $recovered = $this->xor_strings($recovered, $padded);
        }
        
        return [
            'success' => true,
            'data' => $recovered,
            'index' => $corrupted_index
        ];
    }
    
    /**
     * XOR two strings of equal length
     */
    private function xor_strings($a, $b) {
        $result = '';
        $len = strlen($a);
        
        for ($i = 0; $i < $len; $i++) {
            $result .= $a[$i] ^ $b[$i];
        }
        
        return $result;
    }
    
    /**
     * Verify all chunks of a file
     */
    public function verify_file($manifest) {
        $datavault = q3_datavault();
        
        $manifest_id = $manifest['manifest_id'];
        $chunks = $datavault->chunk->get_manifest_chunks($manifest_id);
        
        $results = [
            'verified' => 0,
            'failed' => 0,
            'missing' => 0,
            'errors' => []
        ];
        
        $expected_count = $manifest['chunk_count'];
        
        if (count($chunks) < $expected_count) {
            $results['missing'] = $expected_count - count($chunks);
        }
        
        foreach ($chunks as $chunk) {
            $retrieved = $datavault->chunk->retrieve($manifest_id, $chunk['index']);
            
            if (!$retrieved['success']) {
                $results['failed']++;
                $results['errors'][] = "Chunk {$chunk['index']}: " . ($retrieved['error'] ?? 'Unknown error');
            } else if (isset($retrieved['checksum_verified']) && $retrieved['checksum_verified']) {
                $results['verified']++;
            } else {
                $results['failed']++;
                $results['errors'][] = "Chunk {$chunk['index']}: Checksum verification failed";
            }
        }
        
        return $results;
    }
    
    /**
     * Calculate file-level checksum from all chunks
     */
    public function calculate_file_checksum($chunks_data) {
        $combined = '';
        ksort($chunks_data); // Ensure order
        
        foreach ($chunks_data as $data) {
            $combined .= $data;
        }
        
        return $this->checksum($combined);
    }
}
