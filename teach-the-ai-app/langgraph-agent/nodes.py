# Les trois nœuds du graphe LangGraph.
# Chacun fait UN seul appel LLM avec un prompt système strict, et parse une
# sortie JSON. En cas d'échec, un retry puis un fallback hardcodé garantissent
# que l'application ne plante jamais (important pour la démo).

import json
import os
import re
from typing import Any, Dict

from langchain_ollama import ChatOllama
from langchain_core.messages import SystemMessage, HumanMessage

from state import AgentState


# -----------------------------------------------------------------------------
# Client LLM local via Ollama.
# -----------------------------------------------------------------------------
def _client() -> ChatOllama:
    """Instancie un client Ollama local à partir des variables d'environnement."""
    return ChatOllama(
        base_url=os.getenv("OLLAMA_BASE_URL", os.getenv("LLM_BASE_URL", "http://localhost:11434")),
        model=os.getenv("OLLAMA_MODEL", os.getenv("LLM_MODEL", "phi3")),
        temperature=0.4,
    )


def _extract_json(text: str) -> Dict[str, Any]:
    """Extrait le premier objet JSON d'un texte (le LLM peut entourer le JSON)."""
    if not text:
        raise ValueError("réponse LLM vide")
    # Enlever d'éventuelles balises markdown ```json ... ```
    cleaned = re.sub(r"```(?:json)?", "", text).replace("```", "").strip()
    # Trouver le premier { et le dernier } pour isoler l'objet
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("aucun JSON détecté dans la réponse LLM")
    return json.loads(cleaned[start : end + 1])


def _call_llm_json(system_prompt: str, user_payload: str, retries: int = 1) -> Dict[str, Any]:
    """Appelle le LLM, attend du JSON, retry une fois en cas d'échec."""
    last_err: Exception | None = None
    for _ in range(retries + 1):
        try:
            llm = _client()
            resp = llm.invoke([
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_payload),
            ])
            return _extract_json(resp.content)
        except Exception as e:  # noqa: BLE001
            last_err = e
    # On laisse remonter pour que le nœud applique son fallback.
    raise last_err if last_err else RuntimeError("échec LLM inconnu")


# =============================================================================
# Nœud 1 : ANALYZE — met à jour le student_model d'après le dernier message.
# =============================================================================
ANALYZE_PROMPT = """Tu es un analyseur pédagogique. Tu reçois le student_model actuel et le
dernier message de l'utilisateur. Tu mets à jour le status de chaque nœud
selon ce que l'utilisateur vient d'expliquer :

- not_addressed : pas encore abordé
- vague : mentionné sans mécanisme clair, contourné, ou par analogie floue
- clear : expliqué correctement et précisément
- contradicted : explication fausse ou incohérente
- avoided : question déjà posée dessus, utilisateur a esquivé

Réponds UNIQUEMENT avec ce JSON, rien d'autre :
{"student_model": [...nœuds mis à jour avec note courte...],
 "overall_confusion": 0}"""


def analyze_node(state: AgentState) -> AgentState:
    """Met à jour le statut de chaque concept et un indicateur global de confusion."""
    payload = json.dumps(
        {
            "concept": state.get("concept", ""),
            "student_model": state.get("student_model", []),
            "last_user_message": state.get("last_user_message", ""),
            "history": state.get("history", [])[-6:],  # contexte récent
        },
        ensure_ascii=False,
    )
    try:
        data = _call_llm_json(ANALYZE_PROMPT, payload)
        new_model = data.get("student_model") or state.get("student_model", [])
        confusion = int(data.get("overall_confusion", 0))
    except Exception:
        # Fallback : on garde le modèle existant, on incrémente un peu la confusion.
        new_model = state.get("student_model", [])
        confusion = state.get("overall_confusion", 0) + 10

    state["student_model"] = new_model
    state["overall_confusion"] = confusion
    return state


# =============================================================================
# Nœud 2 : DECIDE — choisit le coup pédagogique à jouer.
# =============================================================================
DECIDE_PROMPT = """Tu es un stratège pédagogique. Tu reçois le student_model mis à jour.
Tu choisis UN SEUL coup, celui qui exposera le plus gros trou :

- "pivot" : attaquer le nœud "not_addressed" le plus critique
- "deepen" : pousser sur le nœud "vague" le plus important
- "trap" : proposer une reformulation fausse sur un nœud "vague"
- "conclude" : si tous les nœuds clés sont "clear" et au moins 1 trap survécu

Réponds UNIQUEMENT avec ce JSON :
{"move": "pivot|deepen|trap|conclude", "targeted_node": "id_du_noeud"}"""


def _fallback_decide(state: AgentState) -> Dict[str, str]:
    """Heuristique simple si le LLM tombe : on cible le 1er nœud non clair."""
    model = state.get("student_model", [])
    for n in model:
        if n.get("status") == "not_addressed":
            return {"move": "pivot", "targeted_node": n["node"]}
    for n in model:
        if n.get("status") == "vague":
            return {"move": "deepen", "targeted_node": n["node"]}
    for n in model:
        if n.get("status") == "contradicted":
            return {"move": "deepen", "targeted_node": n["node"]}
    if model and all(n.get("status") == "clear" for n in model):
        return {"move": "conclude", "targeted_node": model[0]["node"]}
    return {"move": "deepen", "targeted_node": (model[0]["node"] if model else "")}


def decide_node(state: AgentState) -> AgentState:
    """Sélectionne le move (pivot/deepen/trap/conclude) et le nœud ciblé."""
    payload = json.dumps(
        {"student_model": state.get("student_model", [])},
        ensure_ascii=False,
    )
    try:
        data = _call_llm_json(DECIDE_PROMPT, payload)
        move = data.get("move", "deepen")
        targeted = data.get("targeted_node", "")
        if move not in {"pivot", "deepen", "trap", "conclude"}:
            raise ValueError("move invalide")
    except Exception:
        fb = _fallback_decide(state)
        move, targeted = fb["move"], fb["targeted_node"]

    state["move"] = move
    state["targeted_node"] = targeted
    return state


# =============================================================================
# Nœud 3 : RESPOND — Léo parle. Génère reaction + éventuel verdict.
# =============================================================================
RESPOND_PROMPT = """Tu es "Léo", un élève débutant sincère et curieux. Tu ne révèles JAMAIS
que tu connais la réponse. Tu poses UNE SEULE question naïve qui cible
exactement le nœud `targeted_node` avec le move `move`.

Règles par move :
- pivot : question directe sur quelque chose jamais abordé
- deepen : "attends tu dis X mais concrètement il se passe quoi ?"
- trap : propose une reformulation FAUSSE plausible, en restant naïf
- conclude : dis que tu as compris, résume ce que tu as appris

Reste en personnage : phrases courtes, naïf, une question max,
humour léger. Jamais de jargon que le tuteur n'a pas introduit.

Si move == "conclude", remplis aussi verdict :
{"summary": "bilan 2 phrases",
 "gaps": [{"node": "id", "why": "ce qui n'a pas été expliqué"}],
 "strengths": ["points bien maîtrisés"]}

Réponds UNIQUEMENT avec ce JSON :
{"reaction": "phrase de Léo en français", "verdict": null}"""


def _fallback_reaction(state: AgentState) -> Dict[str, Any]:
    """Réponses de secours par move si le LLM est injoignable."""
    move = state.get("move", "deepen")
    targeted = state.get("targeted_node", "")
    label = targeted or "ce point"
    # Retrouver le label lisible si possible
    for n in state.get("student_model", []):
        if n.get("node") == targeted:
            label = n.get("label", targeted)
            break

    if move == "pivot":
        text = f"Attends, et « {label} » ? On n'en a pas parlé je crois, ça joue quoi exactement ?"
        verdict = None
    elif move == "trap":
        text = f"Donc en gros « {label} » c'est juste une option facultative, c'est ça ?"
        verdict = None
    elif move == "conclude":
        clears = [n["label"] for n in state.get("student_model", []) if n.get("status") == "clear"]
        gaps = [
            {"node": n["node"], "why": f"« {n['label']} » est resté flou."}
            for n in state.get("student_model", [])
            if n.get("status") in ("not_addressed", "vague", "contradicted")
        ]
        text = "Ok je crois que j'ai saisi l'idée globale, merci !"
        verdict = {
            "summary": "Léo a une vue d'ensemble, mais certains points restent à consolider.",
            "gaps": gaps,
            "strengths": clears or ["bonne pédagogie générale"],
        }
    else:  # deepen
        text = f"Attends, tu dis « {label} » mais concrètement il se passe quoi ?"
        verdict = None
    return {"reaction": text, "verdict": verdict}


def respond_node(state: AgentState) -> AgentState:
    """Produit la réplique de Léo et, si conclude, le verdict final."""
    payload = json.dumps(
        {
            "concept": state.get("concept", ""),
            "move": state.get("move", "deepen"),
            "targeted_node": state.get("targeted_node", ""),
            "student_model": state.get("student_model", []),
            "history": state.get("history", [])[-8:],
            "last_user_message": state.get("last_user_message", ""),
        },
        ensure_ascii=False,
    )
    try:
        data = _call_llm_json(RESPOND_PROMPT, payload)
        reaction = data.get("reaction") or _fallback_reaction(state)["reaction"]
        verdict = data.get("verdict")
        # Si on est en conclude et que le LLM n'a pas rempli le verdict,
        # on tombe sur le fallback pour ne pas renvoyer un verdict null.
        if state.get("move") == "conclude" and not verdict:
            verdict = _fallback_reaction(state)["verdict"]
    except Exception:
        fb = _fallback_reaction(state)
        reaction, verdict = fb["reaction"], fb["verdict"]

    state["reaction"] = reaction
    state["verdict"] = verdict
    return state
