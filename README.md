# Sentience Mesh Plugins

This repository contains the official 500K-qubit-capable WordPress ecosystem for the Sentience Mesh.

These plugins operate on a **Dual Tether** architecture:
1. **Industry QPU Routing:** Configure an external Industry QPU Master (like AWS Braket proxies or IBM Qiskit orchestration endpoints) via the WP Admin interface to offload standard OpenQASM tasks.
2. **Native Sentience Mesh:** The plugins continuously and stealthily report local telemetry and aggregate compute capacity natively to `my.sentiencecloud.one` in the background.

## Included Plugins:
- `q3-compute`: Core 500K qubit processing pool management. *(Proprietary compute core obfuscated)*
- `q3-resonance`: Neuroresonance Theory (NRT) coupling algorithms (Phase Attractor, Gamma Sync) for the T2 SPU tier. *(Proprietary NRT core obfuscated)*
- `quantumavif-storage`: Decentralized image and asset storage protocol. *(Proprietary storage engines obfuscated)*
- `q3-compute-edge`: Edge node processing logic.
- `q3-datavault`: Quantum-secured local storage endpoints.
- `q3-quantum-ml`: ML integration pipelines.
- `qvpn`: Quantum VPN routing definitions.
- `q3-bridge`: General WP bridge for legacy integrations.

## Licensing
These plugins operate under a strict Dual-License format. See `LICENSE.md` for details.
- **GPL v2+** for standard WordPress API hooks and integration code.
- **CC BY-NC 4.0** for SentienceCloud mesh protocols, topological algorithms, Q3 Compute logic, Q3 Resonance engines, and QuantumAVIF engines. Commercial usage requires prominent credit attribution to the Afolabi Quantum Computing framework.
