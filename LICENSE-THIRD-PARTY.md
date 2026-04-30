# Third-party licenses

## Supertonic (vendored helper)

`src/voicewright/_vendor/supertonic_helper.py` is adapted from
`supertonic/py/helper.py` (https://github.com/supertone-inc/supertonic),
copyright Supertone, Inc., licensed under the MIT License.

Modifications: removed the GPU `NotImplementedError` guard; exposed a
`load_text_to_speech_with_providers` variant that accepts ONNX Runtime
execution providers directly.

```
MIT License

Copyright (c) Supertone, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Supertonic-2 model assets

Downloaded separately by `scripts/setup_assets.{ps1,sh}` from
https://huggingface.co/Supertone/supertonic-2 and licensed under
**OpenRAIL-M**. See the model card for usage restrictions.
