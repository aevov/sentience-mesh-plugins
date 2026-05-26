#!/usr/bin/env python3
"""
Q3 Protocol - Python SDK
S3-compatible client for Quantum Cube Storage

Usage:
    from q3_sdk import Q3Client
    
    client = Q3Client(endpoint='http://localhost:7472')
    client.create_bucket('my-bucket')
    client.put_object('my-bucket', 'file.txt', b'Hello Q3!')
    data = client.get_object('my-bucket', 'file.txt')
"""

import requests
import json
from typing import Dict, List, Optional, Union

class Q3Client:
    """Q3 Protocol Python Client"""
    
    def __init__(self, endpoint: str = 'http://localhost:7472'):
        self.endpoint = endpoint
        self.api_base = f'{endpoint}/api/q3'
        self.session = requests.Session()
        self.session.headers.update({
            'X-Q3-Version': '1.0'
        })
    
    def create_bucket(self, name: str, **options) -> Dict:
        """Create a new Q3 bucket"""
        response = self.session.post(
            f'{self.api_base}/buckets',
            json={'name': name, **options}
        )
        response.raise_for_status()
        data = response.json()
        
        if not data.get('success'):
            raise Exception(data.get('error', 'Failed to create bucket'))
        
        return data['bucket']
    
    def list_buckets(self) -> List[Dict]:
        """List all buckets"""
        response = self.session.get(f'{self.api_base}/buckets')
        response.raise_for_status()
        return response.json().get('buckets', [])
    
    def put_object(self, bucket: str, key: str, data: Union[str, bytes], 
                   metadata: Optional[Dict] = None) -> Dict:
        """Upload an object to a bucket"""
        if isinstance(data, bytes):
            data = data.decode('utf-8')
        
        response = self.session.put(
            f'{self.api_base}/{bucket}/{key}',
            json={'data': data, 'metadata': metadata or {}}
        )
        response.raise_for_status()
        return response.json()
    
    def get_object(self, bucket: str, key: str) -> bytes:
        """Download an object from a bucket"""
        response = self.session.get(f'{self.api_base}/{bucket}/{key}')
        response.raise_for_status()
        return response.content
    
    def delete_object(self, bucket: str, key: str) -> Dict:
        """Delete an object from a bucket"""
        response = self.session.delete(f'{self.api_base}/{bucket}/{key}')
        response.raise_for_status()
        return response.json()
    
    def list_objects(self, bucket: str, prefix: str = '') -> List[Dict]:
        """List objects in a bucket"""
        params = {'prefix': prefix} if prefix else {}
        response = self.session.get(
            f'{self.api_base}/{bucket}/objects',
            params=params
        )
        response.raise_for_status()
        return response.json().get('objects', [])
    
    def get_stats(self) -> Dict:
        """Get storage statistics"""
        response = self.session.get(f'{self.api_base}/stats')
        response.raise_for_status()
        return response.json()


# CLI interface
if __name__ == '__main__':
    import sys
    
    if len(sys.argv) < 2:
        print('Q3 Protocol - Python SDK')
        print('\nUsage:')
        print('  python3 q3_sdk.py create-bucket <name>')
        print('  python3 q3_sdk.py list-buckets')
        print('  python3 q3_sdk.py put <bucket> <key> <data>')
        print('  python3 q3_sdk.py get <bucket> <key>')
        print('  python3 q3_sdk.py stats')
        sys.exit(1)
    
    command = sys.argv[1]
    client = Q3Client()
    
    try:
        if command == 'create-bucket':
            bucket = client.create_bucket(sys.argv[2])
            print(f'✅ Bucket created: {bucket["name"]}')
        
        elif command == 'list-buckets':
            buckets = client.list_buckets()
            print('Buckets:', ', '.join(b['name'] for b in buckets))
        
        elif command == 'put':
            result = client.put_object(sys.argv[2], sys.argv[3], sys.argv[4])
            print(f'✅ Uploaded: {sys.argv[2]}/{sys.argv[3]}')
        
        elif command == 'get':
            data = client.get_object(sys.argv[2], sys.argv[3])
            print(data.decode('utf-8'))
        
        elif command == 'stats':
            stats = client.get_stats()
            print('Q3 Storage Stats:', json.dumps(stats, indent=2))
        
        else:
            print(f'Unknown command: {command}')
            sys.exit(1)
    
    except Exception as e:
        print(f'Error: {e}', file=sys.stderr)
        sys.exit(1)
