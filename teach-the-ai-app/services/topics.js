/**
 * Catalogue des sujets enseignables.
 * Pour chaque sujet on définit :
 *  - id, label, emoji, description
 *  - concepts : notions clés à couvrir (mots-clés)
 *  - clarifyingQuestions : questions que pourrait poser un élève curieux
 *  - exampleRequests : demandes d'exemples concrets
 */
module.exports = [
  {
    id: 'recursion',
    label: 'Récursivité',
    emoji: 'RC',
    description: 'Fonctions qui s\'appellent elles-mêmes pour résoudre des sous-problèmes.',
    concepts: ['cas de base', 'appel récursif', 'pile d\'appels', 'terminaison', 'complexité', 'exemple', 'factorielle', 'fibonacci'],
    clarifyingQuestions: [
      "Qu'est-ce qui empêche une fonction récursive de tourner à l'infini ?",
      "Que se passe-t-il en mémoire quand chaque appel se déclenche ?",
      "Comment décider entre une boucle et une récursion ?"
    ],
    exampleRequests: [
      "Tu peux me montrer un exemple simple en pseudo-code ?",
      "Comment ça marcherait pour calculer une factorielle ?"
    ]
  },
  {
    id: 'photosynthesis',
    label: 'Photosynthèse',
    emoji: 'PH',
    description: 'Processus biologique qui transforme la lumière en énergie chimique chez les plantes.',
    concepts: ['lumière', 'chlorophylle', 'dioxyde de carbone', 'eau', 'glucose', 'oxygène', 'chloroplaste', 'feuille'],
    clarifyingQuestions: [
      "Pourquoi les feuilles sont vertes du coup ?",
      "Que se passe-t-il la nuit, quand il n'y a plus de lumière ?",
      "C'est quoi exactement le rôle de l'eau dans le processus ?"
    ],
    exampleRequests: [
      "Tu peux m'écrire l'équation chimique globale ?",
      "Tu as un exemple concret de ce qu'on observe sur une plante ?"
    ]
  },
  {
    id: 'interest-rate',
    label: 'Taux d\'intérêt',
    emoji: 'TI',
    description: 'Coût de l\'argent emprunté ou rémunération de l\'argent prêté, sur une période donnée.',
    concepts: ['capital', 'intérêt', 'simple', 'composé', 'durée', 'taux annuel', 'inflation', 'rendement'],
    clarifyingQuestions: [
      "Quelle est la différence entre intérêts simples et composés ?",
      "Pourquoi un taux peut-il être négatif ?",
      "L'inflation entre en jeu comment ?"
    ],
    exampleRequests: [
      "Donne-moi un exemple chiffré sur 3 ans.",
      "Si j'emprunte 1000 € à 5 %, je dois rembourser combien ?"
    ]
  },
  {
    id: 'sorting',
    label: 'Algorithmes de tri',
    emoji: 'AT',
    description: 'Techniques pour ordonner une collection d\'éléments selon un critère.',
    concepts: ['tri à bulles', 'tri rapide', 'tri fusion', 'complexité', 'pivot', 'comparaison', 'stable', 'in-place'],
    clarifyingQuestions: [
      "Pourquoi un tri rapide est en moyenne plus efficace qu'un tri à bulles ?",
      "Qu'est-ce qu'un tri stable ?",
      "Quand est-il préférable de choisir le tri fusion ?"
    ],
    exampleRequests: [
      "Tu peux dérouler un tri à bulles sur [3,1,2] ?",
      "Donne-moi un exemple où la complexité importe vraiment."
    ]
  },
  {
    id: 'gravity',
    label: 'Gravité',
    emoji: 'GR',
    description: 'Force d\'attraction entre deux masses, décrite par Newton puis Einstein.',
    concepts: ['masse', 'force', 'accélération', 'newton', 'einstein', 'champ', 'orbite', 'poids'],
    clarifyingQuestions: [
      "Quelle est la différence entre masse et poids ?",
      "Pourquoi la Lune tombe-t-elle sans s'écraser ?",
      "Einstein a remplacé quoi exactement dans la vision de Newton ?"
    ],
    exampleRequests: [
      "Un exemple concret du quotidien ?",
      "Comment on calcule la force entre deux objets ?"
    ]
  },
  {
    id: 'http',
    label: 'Protocole HTTP',
    emoji: 'HT',
    description: 'Protocole d\'échange entre clients et serveurs sur le web.',
    concepts: ['requête', 'réponse', 'méthode', 'get', 'post', 'statut', 'header', 'corps', 'stateless'],
    clarifyingQuestions: [
      "Pourquoi dit-on que HTTP est sans état ?",
      "Quelle est la différence entre GET et POST ?",
      "À quoi servent les codes 4xx vs 5xx ?"
    ],
    exampleRequests: [
      "Tu peux me montrer à quoi ressemble une requête concrète ?",
      "Un exemple de header utile ?"
    ]
  }
];
