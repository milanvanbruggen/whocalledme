# Development Setup

## Ngrok Tunnel

Start the Next.js development server tunnel with ngrok using the fixed domain that is already whitelisted for the project:

```
ngrok http --domain=sharp-unlikely-hornet.ngrok-free.app 3000
```

This ensures external services can reliably reach your local instance at the expected hostname.

