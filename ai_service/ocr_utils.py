def build_vision_ocr_messages(model: str, data_url: str, prompt: str) -> list[dict]:
    """Build provider-compatible OCR messages for a single page/image."""
    if model == "deepseek-ocr":
        return [
            {"role": "system", "content": "<image>\nFree OCR."},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            },
        ]

    return [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": prompt},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        }
    ]
