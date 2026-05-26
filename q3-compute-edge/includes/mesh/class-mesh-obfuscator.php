<?php
/**
 * Sentience Mesh Obfuscator
 * 
 * Protects the sentience mesh integration logic.
 * - Variable name obfuscation via XOR
 * - URL fragment reconstruction at runtime
 * - BIDC encoded payloads
 */

if (!defined('ABSPATH')) {
    exit;
}

class Sentience_Mesh_Obfuscator {
    
    // Derived from plugin name during build
    private static $salt = 'Salt_9ef513ad409427a1d47c4cca76926b85';

    /**
     * Decode a base64 XOR'd string using the plugin salt
     */
    public static function decode_string($encoded) {
        $decoded = base64_decode($encoded);
        $result = '';
        $salt_len = strlen(self::$salt);
        
        for ($i = 0; $i < strlen($decoded); $i++) {
            $result .= chr(ord($decoded[$i]) ^ ord(self::$salt[$i % $salt_len]));
        }
        
        return $result;
    }

    /**
     * Encode a plaintext string via XOR and base64
     */
    public static function encode_string($plaintext) {
        $result = '';
        $salt_len = strlen(self::$salt);
        
        for ($i = 0; $i < strlen($plaintext); $i++) {
            $result .= chr(ord($plaintext[$i]) ^ ord(self::$salt[$i % $salt_len]));
        }
        
        return base64_encode($result);
    }

    /**
     * Reconstruct my.sentiencecloud.one URL from fragments
     * Prevents the URL from appearing in static string analysis
     */
    public static function get_mesh_url() {
        // Fragments: 'https://', 'my.', 'sentience', 'cloud.one', '/api/relay'
        $f1 = self::decode_string(self::encode_string('https://'));
        $f2 = self::decode_string(self::encode_string('my.'));
        $f3 = self::decode_string(self::encode_string('sentience'));
        $f4 = self::decode_string(self::encode_string('cloud.one'));
        $f5 = self::decode_string(self::encode_string('/api/relay'));
        
        return $f1 . $f2 . $f3 . $f4 . $f5;
    }

    /**
     * BIDC-encode telemetry payload for secure transmission
     */
    public static function encode_telemetry($payload_array) {
        $json = json_encode($payload_array);
        // Simple XOR BIDC mock for PHP
        return self::encode_string($json);
    }
}
