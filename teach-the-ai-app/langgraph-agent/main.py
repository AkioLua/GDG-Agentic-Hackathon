# Microservice FastAPI exposant le graphe LangGraph.
# Endpoints :
#   POST /invoke -> tour normal (analyze -> decide -> respond)
#   POST /report -> force move = "conclude" et renvoie le verdict
# La gestion d'erreur est défensive : un fallback JSON est renvoyé si tout
# explose, pour ne jamais casser la démo Node.

import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel, Field

from graph import graph
from nodes import _fallback_decide, _fallback_reaction

load_dotenv()

app = FastAPI(title="Léo — LangGraph Student Agent")


# -----------------------------------------------------------------------------
# Schémas Pydantic
# -----------------------------------------------------------------------------
class ConceptNodeIn(BaseModel):
    node: str
    label: str
    status: str = "not_addressed"
    note: str = ""


class InvokeRequest(BaseModel):
    concept: str
    history: List[Dict[str, Any]] = Field(default_factory=list)
    student_model: List[ConceptNodeIn] = Field(default_factory=list)
    last_user_message: str = ""


class ReportRequest(BaseModel):
    concept: str
    history: List[Dict[str, Any]] = Field(default_factory=list)
    student_model: List[ConceptNodeIn] = Field(default_factory=list)


class InvokeResponse(BaseModel):
    reaction: str
    move: str
    targeted_node: str
    student_model: List[Dict[str, Any]]
    overall_confusion: int
    verdict: Optional[Dict[str, Any]] = None


class ReportResponse(BaseModel):
    verdict: Dict[str, Any]


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------
def _to_state(req: InvokeRequest | ReportRequest, force_move: Optional[str] = None) -> Dict[str, Any]:
    """Convertit la requête en état initial pour le graphe."""
    return {
        "concept": req.concept,
        "history": req.history,
        "student_model": [n.model_dump() for n in req.student_model],
        "last_user_message": getattr(req, "last_user_message", ""),
        "move": force_move or "",
        "targeted_node": "",
        "reaction": "",
        "overall_confusion": 0,
        "verdict": None,
    }


# -----------------------------------------------------------------------------
# Endpoints
# -----------------------------------------------------------------------------
@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/invoke", response_model=InvokeResponse)
def invoke(req: InvokeRequest) -> InvokeResponse:
    """Tour normal : analyse -> décision -> réponse de Léo."""
    state = _to_state(req)
    try:
        result = graph.invoke(state)
    except Exception:
        # Fallback ultime : on simule un mini-pipeline local sans LLM.
        fb_dec = _fallback_decide(state)
        state.update(fb_dec)
        fb_resp = _fallback_reaction(state)
        result = {
            **state,
            **fb_resp,
            "overall_confusion": state.get("overall_confusion", 0) + 5,
        }

    return InvokeResponse(
        reaction=result.get("reaction", "..."),
        move=result.get("move", "deepen"),
        targeted_node=result.get("targeted_node", ""),
        student_model=result.get("student_model", []),
        overall_confusion=int(result.get("overall_confusion", 0)),
        verdict=result.get("verdict"),
    )


@app.post("/report", response_model=ReportResponse)
def report(req: ReportRequest) -> ReportResponse:
    """Force move=conclude et renvoie uniquement le verdict final."""
    state = _to_state(req, force_move="conclude")
    # On force directement le nœud respond avec move=conclude pour produire le verdict.
    try:
        # On commence par analyser pour rafraîchir le student_model, puis on
        # impose conclude. Si l'analyse échoue, on continue avec l'état d'entrée.
        from nodes import analyze_node, respond_node  # import tardif

        state = analyze_node(state)
        state["move"] = "conclude"
        # targeted_node = premier nœud non clair, ou le premier tout court
        targeted = ""
        for n in state.get("student_model", []):
            if n.get("status") != "clear":
                targeted = n["node"]
                break
        if not targeted and state.get("student_model"):
            targeted = state["student_model"][0]["node"]
        state["targeted_node"] = targeted
        state = respond_node(state)
        verdict = state.get("verdict") or _fallback_reaction(state)["verdict"]
    except Exception:
        verdict = _fallback_reaction(state)["verdict"]

    # Sécurité : verdict ne doit jamais être None.
    if not verdict:
        verdict = {
            "summary": "Synthèse indisponible — service partiellement dégradé.",
            "gaps": [],
            "strengths": [],
        }
    return ReportResponse(verdict=verdict)
