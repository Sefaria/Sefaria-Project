import base64
import os
import binascii

def add_base64_padding(base64_string):
    """Add padding to the Base64 string if necessary."""
    missing_padding = len(base64_string) % 4
    if missing_padding:
        base64_string += '=' * (4 - missing_padding)
    return base64_string

# Retrieve the base64 encoded private key from the environment variable
encoded_key = os.getenv('private_key')

if encoded_key is None:
    raise ValueError("Environment variable 'PRIVATE_KEY_BASE64' is not set.")

# Add padding to the encoded key
encoded_key = add_base64_padding(encoded_key)

# Decode the private key
try:
    private_key = base64.b64decode(encoded_key)
except binascii.Error as e:
    raise ValueError(f"Failed to decode Base64 string: {e}")

private_key_1 = private_key.replace(b'\\n', b'\n')