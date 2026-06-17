# État typé du graphe LangGraph.
# Représente toute l'information partagée entre les nœuds (analyze, decide, respond).
from typing import TypedDict, List, Optional
from enum import Enum


class NodeStatus(str, Enum):
    """Statut pédagogique d'un concept dans l'esprit de l'élève."""
    not_addressed = "not_addressed"
    vague = "vague"
    clear = "clear"
    contradicted = "contradicted"
    avoided = "avoided"


class ConceptNode(TypedDict):
    """Un concept clé que l'utilisateur doit avoir transmis."""
    node: str          # identifiant court (ex: "base_case")
    label: str         # libellé lisible (ex: "condition d'arrêt")
    status: str        # une valeur de NodeStatus
    note: str          # courte justification du statut


class AgentState(TypedDict, total=False):
    """État complet manipulé par le graphe."""
    concept: str
    history: List[dict]                # [{role, content}]
    student_model: List[ConceptNode]
    last_user_message: str
    move: str                          # deepen | pivot | trap | conclude
    targeted_node: str
    reaction: str
    overall_confusion: int
    verdict: Optional[dict]
