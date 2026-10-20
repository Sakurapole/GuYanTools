"""Single-image adapter for the official Real-CUGAN PyTorch implementation."""

import json
import os
import sys

from request_schema import validate_request


def main():
    request = validate_request(json.load(sys.stdin))
    import cv2
    import torch
    from upcunet_v3 import RealWaifuUpScaler

    image_path = request["input"]
    weights_path = request["weights"]
    output_path = request["output"]
    options = request["options"]
    if not os.path.isfile(image_path) or not os.path.isfile(weights_path):
        raise ValueError("输入图片或模型权重不存在")
    if options["device"] == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("当前环境没有可用的 NVIDIA CUDA 设备")
    image = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("无法读取输入图片")
    scaler = RealWaifuUpScaler(
        options["scale"], weights_path, options["half"], options["device"]
    )
    output = scaler(image, options["tile"])
    if not cv2.imwrite(output_path, output):
        raise OSError("无法写入输出图片")
    print(json.dumps({"output": os.path.basename(output_path)}), flush=True)


if __name__ == "__main__":
    main()
