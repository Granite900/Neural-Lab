# Neural Lab — Cloud GPU Training Server

PyTorch training backend for Neural Lab. You can run it on **Google Colab** (free, with ngrok) or on a **Google Cloud VM** (no ngrok, no SSL issues).

---

## Option A: Google Cloud VM (no ngrok, recommended if you have a VM)

Use your VM’s external IP so Neural Lab talks to the server over HTTP. No browser/SSL issues.

### 1. Open port 5000 on the VM

In [Google Cloud Console](https://console.cloud.google.com):

- Go to **VPC network → Firewall** (or **Compute Engine → VM instances** → click the VM → **Networking**).
- Create a firewall rule (or edit the default):
  - **Direction:** Ingress  
  - **Targets:** “All instances” or your VM’s network tag  
  - **Source IP ranges:** `0.0.0.0/0` (or your own IP for more security)  
  - **Protocols and ports:** **tcp:5000**  
- Save. Note your VM’s **External IP** (e.g. `34.123.45.67`).

### 2. On the VM: install and run the server

SSH into the VM, then:

```bash
# Install Python 3 and pip if needed (e.g. on Debian/Ubuntu)
sudo apt-get update && sudo apt-get install -y python3 python3-pip

# Clone or upload the Neural Lab project, then:
cd /path/to/Neural\ Lab/cloud-server
pip install --user flask torch
python3 app.py
```

The server will listen on `0.0.0.0:5000`. Leave the SSH session open (or run inside `screen`/`tmux`).

### 3. In Neural Lab

- Open the Training panel, turn on **Cloud GPU**.
- In the URL field enter: **`http://YOUR_VM_EXTERNAL_IP:5000`** (e.g. `http://34.123.45.67:5000`). You can omit `http://`; the app will add it for non-ngrok URLs.
- Click **Test**. You should see “Cloud endpoint reachable”.

To run the server in the background (so it keeps running after you close SSH):

```bash
nohup python3 app.py > server.log 2>&1 &
```

To stop it later: `pkill -f "python3 app.py"`.

---

## Option B: Google Colab (free tier, with ngrok)

1. Sign up for a free account at [ngrok.com](https://ngrok.com)
2. Copy your auth token from the [ngrok dashboard](https://dashboard.ngrok.com/get-started/your-authtoken)
3. Open `Neural_Lab_Cloud.ipynb` in [Google Colab](https://colab.research.google.com)
4. Go to **Runtime → Change runtime type** → select **T4 GPU**
5. Paste your ngrok auth token into Cell 2
6. **Run all cells** (Ctrl+F9). The notebook prints a URL like `https://xxxx.ngrok-free.dev` — copy that **exact URL** (not the object or anything else).
7. Run **Cell 4** to test the tunnel from Colab. If it prints "Tunnel OK: ..." the server is reachable.
8. In Neural Lab, open the Training panel, toggle **Cloud GPU** on, paste the URL (use **https**).
9. If Test fails with a network error: open the URL in a new browser tab (e.g. `https://your-url.ngrok-free.dev/ping`), click through any ngrok warning page, then try **Test** again in Neural Lab.

## How it works

- Neural Lab sends the network topology + training data as JSON to `POST /train`
- The server trains with PyTorch autograd (real backpropagation) on the GPU
- Returns trained weights + loss history as JSON
- No API key needed — ngrok provides a public tunnel to the Colab runtime

## Local testing (no GPU needed)

```bash
pip install flask torch
python app.py
```

Server starts at `http://localhost:5000`. Use that URL in Neural Lab for local testing.

## Troubleshooting: "Secure Connection Failed" (SSL_ERROR_RX_RECORD_TOO_LONG)

The tunnel works from Colab (Cell 4 OK) but your browser fails with this error when loading the ngrok URL. That usually means something on your machine is interfering with HTTPS to ngrok.

**Try in this order:**

1. **Use another browser**  
   Open Neural Lab in **Chrome** or **Edge** (same URL, e.g. `http://localhost:8000`). If Test works there, the issue is specific to Firefox.

2. **Antivirus / security software**  
   Many tools (Kaspersky, Avast, Norton, etc.) do "HTTPS scanning" and can break connections to ngrok.  
   - Temporarily turn off "HTTPS scanning" or "SSL inspection", or  
   - Add an exception for `*.ngrok-free.dev` and `*.ngrok-free.app`, then reload and try again.

3. **Firefox settings**  
   - Go to **Settings → Privacy & Security**.  
   - Under **HTTPS-Only Mode**, try "Don’t enable HTTPS-Only Mode" temporarily to see if behavior changes.  
   - Ensure you’re not using a proxy that might alter HTTPS (Settings → Network Settings → No proxy if you don’t need one).

4. **VPN**  
   If you use a VPN, try disconnecting briefly and testing again. Some VPNs break TLS to certain domains.

5. **Run Neural Lab in Chrome**  
   If only Firefox fails, use Chrome for Neural Lab when using Cloud GPU: run `python -m http.server 8000`, then open `http://localhost:8000` in Chrome and paste the ngrok URL there.

## Notes

- **Run Neural Lab over HTTP** — If you open `index.html` as a file (`file://`), the browser may block requests to ngrok with a network error. Use a local server instead, e.g. `python -m http.server 8000` in the Neural Lab folder, then open `http://localhost:8000`.
- ngrok URLs are **temporary** — they change each time you restart the Colab notebook.
- Colab sessions disconnect after ~90 minutes of inactivity.
- The free ngrok tier shows a browser warning; Neural Lab sends a header to skip it automatically.
