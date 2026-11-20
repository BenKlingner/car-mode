# Car Mode

A Paseo plugin that adds a big-button dashboard for checking on and talking to your agents from a car browser. It is made for the Tesla in-car browser, which can open the Paseo web app at app.paseo.sh through relay pairing.

See [OVERVIEW.md](OVERVIEW.md) for what it does.

## Install

```bash
paseo plugin install github:BenKlingner/car-mode
```

Open it from the **Car mode** row in Paseo's sidebar, or search "car mode" in the Command Center.

## Requirements

- Paseo 0.16.2 or later.
- For **Speak** (voice typing) and **Listen** (read aloud): a Paseo daemon without a password, with local voice models installed in Paseo's voice settings. Listen uses Kokoro.
- Listen adds the `sherpa-onnx-node` speech engine, the same one Paseo uses.

## Development

```bash
npm install
npm run typecheck
paseo plugin install "$(pwd)"
paseo plugin reload car-mode
```

Not affiliated with or endorsed by Tesla.
