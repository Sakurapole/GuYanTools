import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "resources" / "model-plugins" / "real-cugan" / "python"))
from request_schema import validate_request


class RequestSchemaTests(unittest.TestCase):
    def test_accepts_a_valid_single_image_request(self):
        request = validate_request({
            "input": "/tmp/input.png", "weights": "/tmp/model.pth", "output": "/tmp/out.png",
            "options": {"scale": 2, "tile": 2, "device": "cpu", "half": False},
        })
        self.assertEqual(request["options"]["scale"], 2)

    def test_rejects_invalid_device_and_scale(self):
        base = {"input": "/tmp/input.png", "weights": "/tmp/model.pth", "output": "/tmp/out.png"}
        with self.assertRaises(ValueError):
            validate_request({**base, "options": {"scale": 5, "tile": 2, "device": "cpu", "half": False}})
        with self.assertRaises(ValueError):
            validate_request({**base, "options": {"scale": 2, "tile": 2, "device": "mps", "half": False}})


if __name__ == "__main__":
    unittest.main()
