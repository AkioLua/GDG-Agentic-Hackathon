# Définition du graphe LangGraph.
# Flux : analyze -> decide -> (respond) -> END
# La transition conditionnelle après "decide" route systématiquement vers
# "respond" (Léo doit toujours parler, même pour conclure), tout en gardant
# la structure prévue par le cahier des charges.

from langgraph.graph import StateGraph, END

from nodes import analyze_node, decide_node, respond_node
from state import AgentState


def should_continue(state: AgentState) -> str:
    """On garde la décision finale après respond ; la condition sert au routage."""
    return "respond" if state.get("move") != "conclude" else "respond_end"


builder = StateGraph(AgentState)
builder.add_node("analyze", analyze_node)
builder.add_node("decide", decide_node)
builder.add_node("respond", respond_node)
builder.add_node("respond_end", respond_node)  # même fonction, sortie directe

builder.set_entry_point("analyze")
builder.add_edge("analyze", "decide")
builder.add_conditional_edges(
    "decide",
    should_continue,
    {"respond": "respond", "respond_end": "respond_end"},
)
builder.add_edge("respond", END)
builder.add_edge("respond_end", END)

graph = builder.compile()
