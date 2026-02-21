"""
Neural Lab — Cloud Training Server (Flask + PyTorch)

Run locally for testing:
    pip install flask torch
    python app.py

Or use the Google Colab notebook (Neural_Lab_Cloud.ipynb) for free GPU access.
"""

import torch
import time
from flask import Flask, request, jsonify

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

app = Flask(__name__)


@app.after_request
def add_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, ngrok-skip-browser-warning"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    return response


@app.route("/ping", methods=["GET", "OPTIONS"])
def ping():
    if request.method == "OPTIONS":
        return "", 204
    return jsonify({"status": "ok", "device": str(device)})


@app.route("/train", methods=["POST", "OPTIONS"])
def train():
    if request.method == "OPTIONS":
        return "", 204

    config = request.get_json(force=True)
    nodes_cfg = config["nodes"]
    conn_list = config["connections"]
    data = config["trainingData"]
    lr = float(config.get("learningRate", 0.5))
    epochs = int(config.get("epochs", 500))
    input_labels = config["inputLabels"]
    topo_order = config["topologicalOrder"]

    if not data:
        return jsonify({"error": "No training data provided"})

    incoming = {}
    for c in conn_list:
        incoming.setdefault(c["to"], []).append(c["from"])

    params = {}
    param_list = []
    for nid, node in nodes_cfg.items():
        if node["type"] in ("weight", "bias"):
            p = torch.tensor(
                float(node["value"]),
                dtype=torch.float32,
                device=device,
                requires_grad=True,
            )
            params[nid] = p
            param_list.append(p)

    if not param_list:
        return jsonify({"error": "No trainable parameters (weights/biases) found"})

    optimizer = torch.optim.SGD(param_list, lr=lr)
    loss_history = []
    report_interval = max(1, epochs // 200)

    t0 = time.time()

    for epoch in range(epochs):
        total_loss = torch.tensor(0.0, device=device)

        for row in data:
            tensors = {}
            for nid in topo_order:
                node = nodes_cfg.get(nid)
                if not node:
                    continue
                ntype = node["type"]
                inc = incoming.get(nid, [])

                if ntype == "input":
                    idx = (
                        input_labels.index(node["label"])
                        if node["label"] in input_labels
                        else 0
                    )
                    val = (
                        float(row["inputs"][idx])
                        if idx < len(row["inputs"])
                        else 0.0
                    )
                    tensors[nid] = torch.tensor(
                        val, dtype=torch.float32, device=device
                    )
                elif ntype == "bias":
                    tensors[nid] = params[nid]
                elif ntype == "weight":
                    if not inc:
                        tensors[nid] = params[nid]
                    else:
                        s = torch.tensor(0.0, device=device)
                        for fid in inc:
                            t = tensors.get(fid)
                            if t is not None:
                                s = s + t
                        tensors[nid] = s * params[nid]
                elif ntype in ("neuron", "activation"):
                    s = torch.tensor(0.0, device=device)
                    for fid in inc:
                        t = tensors.get(fid)
                        if t is not None:
                            s = s + t
                    act = node.get("activation", "linear")
                    if act == "sigmoid":
                        s = torch.sigmoid(s)
                    elif act == "relu":
                        s = torch.relu(s)
                    elif act == "tanh":
                        s = torch.tanh(s)
                    tensors[nid] = s
                elif ntype == "output":
                    s = torch.tensor(0.0, device=device)
                    for fid in inc:
                        t = tensors.get(fid)
                        if t is not None:
                            s = s + t
                    tensors[nid] = s

            predicted = tensors.get(
                "output", torch.tensor(0.0, device=device)
            )
            diff = predicted - float(row["expected"])
            total_loss = total_loss + diff**2

        loss = total_loss / len(data)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        if epoch % report_interval == 0 or epoch == epochs - 1:
            loss_history.append(round(loss.item(), 8))

    elapsed = round(time.time() - t0, 3)

    trained_weights = []
    for nid, p in params.items():
        trained_weights.append({"id": nid, "value": round(p.item(), 6)})

    return jsonify(
        {
            "trainedWeights": trained_weights,
            "lossHistory": loss_history,
            "finalLoss": loss_history[-1] if loss_history else 0,
            "epochs": epochs,
            "elapsed": elapsed,
            "device": str(device),
        }
    )


if __name__ == "__main__":
    print(f"Neural Lab Cloud Server — using {device}")
    print("Server starting at http://localhost:5000")
    app.run(host="0.0.0.0", port=5000)
