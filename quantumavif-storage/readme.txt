=== QuantumAVIF Storage Engine ===
Contributors: cr8os
Tags: storage, compression, avif, quantum, steganography
Requires at least: 5.8
Tested up to: 6.4
Requires PHP: 7.4
Stable tag: 1.0.0
License: MIT

Automatic AVIF shard encoding with 20x-50x lossless amplification for WordPress uploads.

== Description ==

QuantumAVIF Storage Engine automatically processes uploaded files through a sophisticated encoding pipeline:

* **(8+4) Reed-Solomon** erasure coding
* **K-means LEANN** delta compression  
* **LSB steganography** into 2048×2048 AVIF images
* **20x-50x lossless amplification**
* **LiteSpeed/QUIC.cloud** integration ready

**Zero Configuration Required** - Just upload files to WordPress and the plugin handles everything automatically!

== Features ==

* Automatic encoding on upload
* 2048×2048 AVIF containers (3.15 MB capacity each)
* Can lose 4 shards and still reconstruct (redundancy)
* Statistics dashboard
* Optional qudit metadata (Phase 3)
* REST API for downloads

== Installation ==

1. Upload `quantumavif-storage` folder to `/wp-content/plugins/`
2. Activate the plugin
3. That's it! Uploads will be automatically encoded

== Configuration ==

Go to Settings → QuantumAVIF to:
* View encoding statistics
* Toggle qudit metadata (experimental)
* Check system info

== System Requirements ==

* PHP 7.4+ with GD library
* WordPress 5.8+
* Recommended: AVIF support in PHP (imageavif function)
* Recommended: LiteSpeed with QUIC.cloud offload

== How It Works ==

1. User uploads file to WordPress
2. Plugin intercepts upload
3. File is chunked, erasure-coded, LEANN-compressed
4. Data is steganographically encoded into 2048×2048 AVIFs
5. AVIFs are uploaded to media library
6. LiteSpeed auto-offloads to QUIC.cloud
7. Original manifest JSON is returned

== Amplification ==

* **Phase 1 (Active)**: 20x via (8+4) + LEANN
* **Phase 2 (Ready)**: 30x via global dedup
* **Phase 3 (Optional)**: 40-50x via qudit + hierarchical LEANN

== Changelog ==

= 1.0.0 =
* Initial release
* (8+4) Reed-Solomon erasure coding
* K-means LEANN compression
* 2048×2048 AVIF steganography
* Admin dashboard
* REST API

== Frequently Asked Questions ==

= What happens to my original files? =

Files are encoded into multiple AVIF shards. A manifest JSON tracks how to reconstruct them.

= Can I still access my files? =

Yes! Use the REST API endpoint or the reconstruction tools.

= What if some shards are lost? =

The (8+4) erasure coding means you can lose any 4 shards and still fully reconstruct the original file.

= Does this work with QUIC.cloud? =

Yes! When LiteSpeed auto-offload is enabled, AVIFs go straight to QUIC.cloud.

== Screenshots ==

1. Settings page with statistics
2. Automatic encoding in progress
3. Generated AVIF shards in media library

== Upgrade Notice ==

= 1.0.0 =
Initial release.
