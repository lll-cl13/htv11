"""
A small tool-using AI agent powered by Gemini (google-genai SDK).

Setup:
    pip install -r requirements.txt
    export GEMINI_API_KEY="your-key"     # get one at https://aistudio.google.com/apikey
    python agent.py

-- instructions --

first you have to add your own key to .env

cd to folder marvin 
type py agent.py in the terminal

this opens ai agent:
prompt it with png path within sample
you> /img person3.png | what's in this picture? | what's in this picture?       
exit type ctrl+C

gemini api key is stored in key.env

to add sample photos, put them in sample folder
"""

import ast
import operator
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()


MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

SYSTEM_PROMPT = (
    "You will receive a facial photo of a senior and you are to analyze their health condition. "
    "If they are healthy condition, respond with 'Good'."
    "if there is something unusual or harmful in their physical condition, respond with one-three words that describes the issue."
)

FEW_SHOT_HISTORY = [
    types.Content(
        role="user",
        parts=[types.Part.from_text(text="/img person1.png | what's in this picture? | what's in this picture?")],
    ),
    types.Content(
        role="model",
        parts=[types.Part.from_text(text="Good")],
    ),
    types.Content(
        role="user",
        parts=[types.Part.from_text(text="/img person2.png | what's in this picture? | what's in this picture?")],
    ),
    types.Content(
        role="model",
        parts=[types.Part.from_text(text="Skin Rash")],
    ),
    types.Content(
        role="user",
        parts=[types.Part.from_text(text="/img person3.png | what's in this picture? | what's in this picture?")],
    ),
    types.Content(
        role="model",
        parts=[types.Part.from_text(text="Pink Eye")],
    ),
    types.Content(
        role="user",
        parts=[types.Part.from_text(text="/img person4.png | what's in this picture? | what's in this picture?")],
    ),
    types.Content(
        role="model",
        parts=[types.Part.from_text(text="Bruise")],
    )
]


# --------------------------------------------------------------------------
# Tools: plain Python functions. The SDK reads the type hints and docstrings
# to build the tool schema, so keep both accurate and descriptive.
# --------------------------------------------------------------------------

_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.Mod: operator.mod,
    ast.USub: operator.neg,
}

import mimetypes

def image_part(path: str) -> types.Part:
    mime, _ = mimetypes.guess_type(path)
    with open(path, "rb") as f:
        return types.Part.from_bytes(data=f.read(), mime_type=mime or "image/jpeg")

def _eval_node(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval_node(node.left), _eval_node(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _OPS:
        return _OPS[type(node.op)](_eval_node(node.operand))
    raise ValueError("Unsupported expression")


def calculate(expression: str) -> dict:
    """Evaluate an arithmetic expression such as '(12.5 * 4) / 3 + 2**8'.

    Args:
        expression: A math expression using + - * / ** % and parentheses.

    Returns:
        A dict with the numeric 'result', or an 'error' message.
    """
    try:
        tree = ast.parse(expression, mode="eval")
        return {"result": _eval_node(tree.body)}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"Could not evaluate '{expression}': {exc}"}


def get_current_time(timezone: str = "UTC") -> dict:
    """Get the current date and time in an IANA timezone.

    Args:
        timezone: IANA timezone name, e.g. 'America/Toronto' or 'Europe/London'.

    Returns:
        A dict with the ISO-formatted 'time' and the 'timezone', or an 'error'.
    """
    try:
        now = datetime.now(ZoneInfo(timezone))
        return {"time": now.isoformat(timespec="seconds"), "timezone": timezone}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"Unknown timezone '{timezone}': {exc}"}


_NOTES: dict[str, str] = {}


def save_note(title: str, content: str) -> dict:
    """Save a short note in memory for later retrieval during this session.

    Args:
        title: A short unique name for the note.
        content: The text to store.

    Returns:
        A dict confirming the save.
    """
    _NOTES[title] = content
    return {"status": "saved", "title": title}


def get_note(title: str) -> dict:
    """Retrieve a previously saved note by title.

    Args:
        title: The note title used when saving.

    Returns:
        A dict with the note 'content', or an 'error' if it doesn't exist.
    """
    if title in _NOTES:
        return {"title": title, "content": _NOTES[title]}
    return {"error": f"No note titled '{title}'", "available": list(_NOTES)}


TOOLS = [calculate, get_current_time, save_note, get_note]


# --------------------------------------------------------------------------
# Agent
# --------------------------------------------------------------------------

class GeminiAgent:
    def __init__(self, model: str = MODEL):
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            sys.exit("Set GEMINI_API_KEY (https://aistudio.google.com/apikey).")

        self.client = genai.Client(api_key=api_key)
        # A chat session keeps the conversation history for you. Passing Python
        # functions as tools enables automatic function calling: the SDK runs
        # the model -> tool -> model loop until it has a final answer.
        self.chat = self.client.chats.create(
            model=model,
            history=FEW_SHOT_HISTORY,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                tools=TOOLS,
                temperature=0.3,
                automatic_function_calling=types.AutomaticFunctionCallingConfig(
                    maximum_remote_calls=8  # safety cap on tool-call loops
                ),
            ),
        )

    def run(self, user_input: str) -> str:
        response = self.chat.send_message(user_input)
        return response.text or "(no text response)"

    def stream(self, user_input):
        for chunk in self.chat.send_message_stream(user_input):
            if not chunk.candidates:
                continue
            content = chunk.candidates[0].content
            if not content or not content.parts:
                continue
            for part in content.parts:
                if part.text:
                    yield part.text


def main() -> None:
    agent = GeminiAgent()
    print(f"Gemini agent ready (model: {MODEL}). Type 'exit' to quit.\n")
    while True:
        try:
            user_input = input("you> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if user_input.lower() in {"exit", "quit"}:
            break
        if not user_input:
            continue
        try:
            print("agent> ", end="", flush=True)
            message = user_input
            if user_input.startswith("/img "):
                path, _, question = user_input[5:].partition("|")
                path = path.strip().strip('"')
                path = "sample/" + path
                message = [image_part(path), question.strip() or "Describe this image."]

            for piece in agent.stream(message):
                print(piece, end="", flush=True)
        except Exception as exc:  # noqa: BLE001
            print(f"\n[error] {exc}\n")


if __name__ == "__main__":
    main()
