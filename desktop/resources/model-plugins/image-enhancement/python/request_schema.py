def validate_request(value):
    if not isinstance(value, dict) or set(value) != {"input", "weights", "output", "options"}:
        raise ValueError("MODEL_REQUEST_INVALID")
    for key in ("input", "weights", "output"):
        if not isinstance(value[key], str) or not value[key]:
            raise ValueError(f"MODEL_{key.upper()}_INVALID")
    options = value["options"]
    if not isinstance(options, dict) or set(options) != {"scale", "tile", "device", "half"}:
        raise ValueError("MODEL_OPTIONS_INVALID")
    if type(options["scale"]) is not int or options["scale"] not in (2, 3, 4):
        raise ValueError("MODEL_SCALE_INVALID")
    if type(options["tile"]) is not int or options["tile"] not in (0, 1, 2, 3, 4):
        raise ValueError("MODEL_TILE_INVALID")
    if options["device"] not in ("cpu", "cuda"):
        raise ValueError("MODEL_DEVICE_INVALID")
    if type(options["half"]) is not bool:
        raise ValueError("MODEL_HALF_INVALID")
    if options["half"] and options["device"] != "cuda":
        raise ValueError("MODEL_HALF_REQUIRES_CUDA")
    return value
