import io
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "resources" / "model-plugins" / "real-cugan" / "python"))
import runner


class RunnerTests(unittest.TestCase):
    def test_passes_selected_options_to_scaler_and_reports_output(self):
        calls = []

        class Scaler:
            def __init__(self, scale, weights, half, device):
                calls.append((scale, weights, half, device))

            def __call__(self, image, tile):
                calls.append((image, tile))
                return "upscaled"

        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "input.png"
            weights = Path(folder) / "model.pth"
            output = Path(folder) / "result.png"
            source.write_bytes(b"image")
            weights.write_bytes(b"weights")
            request = {
                "input": str(source), "weights": str(weights), "output": str(output),
                "options": {"scale": 3, "tile": 2, "device": "cpu", "half": False},
            }
            cv2 = types.SimpleNamespace(
                IMREAD_COLOR=1, imread=lambda path, mode: "image-data",
                imwrite=lambda path, image: calls.append((path, image)) or True,
            )
            modules = {
                "cv2": cv2,
                "torch": types.SimpleNamespace(cuda=types.SimpleNamespace(is_available=lambda: False)),
                "upcunet_v3": types.SimpleNamespace(RealWaifuUpScaler=Scaler),
            }
            output_text = io.StringIO()
            with patch.dict(sys.modules, modules), patch.object(sys, "stdin", io.StringIO(json.dumps(request))), patch.object(sys, "stdout", output_text):
                runner.main()

            self.assertEqual(calls, [
                (3, str(weights), False, "cpu"),
                ("image-data", 2),
                (str(output), "upscaled"),
            ])
            self.assertEqual(json.loads(output_text.getvalue()), {"output": "result.png"})


if __name__ == "__main__":
    unittest.main()
