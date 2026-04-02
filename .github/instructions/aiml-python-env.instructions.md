---
description: "Use when running Python commands, installing Python libraries, or setting up Python tooling on Windows. Always use the AIML environment alias (`aiml`) or the explicit interpreter at `C:\\AIML\\Python\\env\\aiml\\Scripts\\python.exe`; avoid global Python and local project virtual environments."
name: "AIML Python Environment Rule"
applyTo: "**/*.py, **/requirements*.txt, **/pyproject.toml"
---
# AIML Python Environment Rule

- Treat this as a **hard rule** for Python operations in this project.
- For any Python terminal operation, use the centralized AIML environment:
  - Preferred: run `aiml` first, then run Python or pip commands.
  - Fallback: use `C:\AIML\Python\env\aiml\Scripts\python.exe` explicitly.
- Install Python libraries only into AIML env (never global/system Python).
- Do **not** create or use local virtual env folders like `venv`, `.venv`, or `env`.
- Prefer `python -m pip ...` over bare `pip ...` for package operations.
- Keep dependency manifests (`requirements.txt`, `pyproject.toml`) updated, but ensure installs happen via AIML env.
- When paths include spaces, use fully quoted Windows paths.
