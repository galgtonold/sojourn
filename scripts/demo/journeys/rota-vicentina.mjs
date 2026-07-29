// The Fishermen's Trail, southwest Portugal — the demo's walking journey.
//
// Every leg routes on the foot profile, so the line follows the actual clifftop
// path rather than the inland road, and the elevation profile picks up the real
// business of this trail: dropping to sea level at every stream mouth and
// climbing straight back out.

export const rotaVicentina = {
  slug: "rota-vicentina",
  title: {
    en: "The Fishermen's Trail",
    de: "Der Fischerpfad",
  },
  summary: {
    en: "Four days walking south along the Alentejo cliffs from Porto Covo to Odeceixe, mostly in sand, entirely within sight of the Atlantic.",
    de: "Vier Tage an den Klippen des Alentejo nach Süden, von Porto Covo bis Odeceixe — meist im Sand, immer in Sichtweite des Atlantiks.",
  },
  start: "2025-04-12",
  end: "2025-04-16",
  posts: [
    {
      slug: "porto-covo-to-milfontes",
      date: "2025-04-13",
      place: "Vila Nova de Milfontes, Alentejo",
      lat: 37.725,
      lng: -8.7833,
      title: { en: "Seventeen Kilometres of Sand", de: "Siebzehn Kilometer Sand" },
      excerpt: {
        en: "Nobody tells you that the Fishermen's Trail is mostly walking uphill in soft sand.",
        de: "Niemand sagt einem, dass der Fischerpfad größtenteils daraus besteht, bergauf durch weichen Sand zu laufen.",
      },
      body: {
        en: `The Rota Vicentina's Fishermen's Trail has one characteristic that the photographs cannot convey, and it is this: sand.

Not beach. Path. The route runs along the top of the cliffs on what is essentially a dune, and for seventeen kilometres your foot lands and then keeps going down another three centimetres. By the afternoon your calves have opinions.

[photo:1]

It is completely worth it. There is no road in sight for hours at a time, the cliffs are that particular Alentejo orange, and every kilometre or so there's a fisherman perched on a ledge you would not go near for money.

Milfontes appears across the Mira estuary in the evening, white and low, and you have to walk inland to the bridge to reach it, which at kilometre twenty feels personal.`,
        de: `Der Fischerpfad der Rota Vicentina hat eine Eigenschaft, die kein Foto vermitteln kann, und die ist: Sand.

Kein Strand. Weg. Die Route läuft oben auf den Klippen über das, was im Grunde eine Düne ist, und siebzehn Kilometer lang setzt der Fuß auf und sinkt dann noch drei Zentimeter weiter ein. Am Nachmittag haben die Waden eine Meinung.

[photo:1]

Es lohnt sich vollkommen. Stundenlang ist keine Straße in Sicht, die Klippen haben dieses spezielle Alentejo-Orange, und etwa jeden Kilometer hockt ein Angler auf einem Vorsprung, dem man für kein Geld nahe käme.

Abends taucht Milfontes über der Mira-Mündung auf, weiß und flach — und man muss landeinwärts zur Brücke laufen, um hinzukommen, was sich bei Kilometer zwanzig persönlich anfühlt.`,
      },
      route: {
        profile: "foot",
        name: { en: "Porto Covo → Vila Nova de Milfontes", de: "Porto Covo → Vila Nova de Milfontes" },
        waypoints: [
          [-8.7906, 37.8517],
          [-8.7960, 37.8100],
          [-8.7900, 37.7600],
          [-8.7833, 37.725],
        ],
      },
      photos: [
        {
          file: "Porto Covo February 2009-2.jpg",
          lat: 37.81,
          lng: -8.796,
          caption: {
            en: "Somewhere around kilometre eight. The path is the sand.",
            de: "Irgendwo bei Kilometer acht. Der Weg ist der Sand.",
          },
        },
        {
          search: "Vila Nova de Milfontes",
          lat: 37.725,
          lng: -8.7833,
          caption: {
            en: "Milfontes across the Mira. Another 4 km to actually get there.",
            de: "Milfontes über der Mira. Nochmal 4 km, um wirklich anzukommen.",
          },
        },
      ],
      ask: {
        kind: "poll",
        question: {
          en: "Multi-day walk. How are you carrying it?",
          de: "Mehrtageswanderung. Wie trägst du?",
        },
        options: {
          en: ["Everything on my back", "Luggage transfer between guesthouses", "Camping, full self-support", "Day walks from one base"],
          de: ["Alles auf dem Rücken", "Gepäcktransfer zwischen den Unterkünften", "Zelt, alles selbst", "Tagestouren von einem Standort"],
        },
      },
      comments: [
        { author: "Ana", days: 2, body: { en: "The sand is the whole trail. People train for the distance and get destroyed by the surface.", de: "Der Sand ist der ganze Weg. Leute trainieren für die Distanz und gehen an der Oberfläche kaputt." } },
        { author: "Hendrik", days: 5, body: { en: "Do it northbound and the wind is behind you. Learned that the hard way.", de: "Nordwärts laufen, dann hat man den Wind im Rücken. Auf die harte Tour gelernt." } },
      ],
    },
    {
      slug: "almograve-storks",
      date: "2025-04-14",
      place: "Almograve, Alentejo",
      lat: 37.65,
      lng: -8.8,
      title: { en: "The Storks That Nest on Sea Stacks", de: "Die Störche, die auf Felsnadeln nisten" },
      excerpt: {
        en: "There is exactly one place on Earth where white storks nest on Atlantic sea stacks, and you walk straight past it.",
        de: "Es gibt genau einen Ort auf der Erde, an dem Weißstörche auf atlantischen Felsnadeln nisten — und man läuft direkt daran vorbei.",
      },
      body: {
        en: `Short day, and the reason to slow down for it is standing on top of the sea stacks just south of Cabo Sardão.

White storks nest on buildings. Everywhere in Iberia, on every church tower and pylon and chimney. Here — and, as far as anyone can establish, only here — they nest on rock pillars in the Atlantic, with surf breaking underneath them and the nest a metre from a hundred-foot drop.

[photo:1]

Nobody has a satisfying explanation. The colony is old, the ledges are safe from ground predators, and the storks appear to have simply decided.

[ask:1]

We sat above them for an hour and didn't do much else with the day, which is what the short stages are for.`,
        de: `Kurze Etappe, und der Grund, dafür langsamer zu machen, steht auf den Felsnadeln knapp südlich des Cabo Sardão.

Weißstörche nisten auf Gebäuden. Überall auf der Iberischen Halbinsel, auf jedem Kirchturm, Strommast und Schornstein. Hier — und soweit sich das feststellen lässt, nur hier — nisten sie auf Felspfeilern im Atlantik, mit brechender Brandung darunter und dem Nest einen Meter vom dreißig Meter tiefen Abgrund entfernt.

[photo:1]

Niemand hat eine befriedigende Erklärung. Die Kolonie ist alt, die Simse sind sicher vor Bodenräubern, und die Störche haben es offenbar einfach beschlossen.

[ask:1]

Wir saßen eine Stunde über ihnen und machten sonst nicht viel mit dem Tag, wofür die kurzen Etappen ja da sind.`,
      },
      route: {
        profile: "foot",
        name: { en: "Milfontes → Almograve", de: "Milfontes → Almograve" },
        waypoints: [
          [-8.7833, 37.725],
          [-8.7950, 37.6900],
          [-8.8000, 37.65],
        ],
      },
      photos: [
        {
          search: "Cabo Sardão stork nest",
          lat: 37.5967,
          lng: -8.8189,
          caption: {
            en: "Cabo Sardão. The nest is the untidy bit on the left-hand pillar.",
            de: "Cabo Sardão. Das Nest ist das Unordentliche auf dem linken Pfeiler.",
          },
        },
        {
          search: "Almograve beach Portugal",
          lat: 37.65,
          lng: -8.8,
          caption: {
            en: "Praia de Almograve at the end of the stage.",
            de: "Praia de Almograve am Ende der Etappe.",
          },
        },
      ],
      ask: {
        kind: "quiz",
        question: {
          en: "Why is the Cabo Sardão stork colony so unusual?",
          de: "Warum ist die Storchenkolonie am Cabo Sardão so ungewöhnlich?",
        },
        options: {
          en: ["It's the only one that doesn't migrate", "It's the only known colony nesting on sea cliffs", "The birds here are a separate subspecies", "It's the largest colony in Europe"],
          de: ["Sie ist die einzige, die nicht zieht", "Sie ist die einzige bekannte Kolonie an Meeresklippen", "Die Vögel sind eine eigene Unterart", "Sie ist die größte Kolonie Europas"],
        },
        correctIndex: 1,
        explanation: {
          en: "White storks nest on buildings and trees across their whole range. The Cabo Sardão birds are the only population known to nest on Atlantic sea cliffs and stacks — which is why this stretch of coast is protected partly on their account.",
          de: "Weißstörche nisten in ihrem gesamten Verbreitungsgebiet auf Gebäuden und Bäumen. Die Vögel am Cabo Sardão sind die einzige bekannte Population, die an atlantischen Klippen und Felsnadeln brütet — weshalb dieser Küstenabschnitt auch ihretwegen geschützt ist.",
        },
      },
      comments: [
        { author: "Rui", days: 3, body: { en: "Best between March and July. By August they've gone and it's just a nice cliff.", de: "Am besten zwischen März und Juli. Ab August sind sie weg, und es ist nur eine schöne Klippe." } },
      ],
    },
    {
      slug: "zambujeira-do-mar",
      date: "2025-04-15",
      place: "Zambujeira do Mar, Alentejo",
      lat: 37.53,
      lng: -8.786,
      title: { en: "Wind, and a Village on a Ledge", de: "Wind, und ein Dorf auf einem Sims" },
      excerpt: {
        en: "The Nortada gets up around eleven and by two it is walking with you whether you like it or not.",
        de: "Die Nortada kommt gegen elf auf, und um zwei läuft sie mit, ob man will oder nicht.",
      },
      body: {
        en: `The northerly here has a name — the *Nortada* — which is always a sign. It gets up mid-morning, builds all afternoon, and by two you have stopped trying to keep a hat on.

Walking south it is behind you, which is the single best argument for doing this trail in this direction. Eighteen kilometres today and the wind did about four of them for us.

[photo:1]

Zambujeira sits on a ledge above its own small beach: a church, a square, three restaurants, and a drop. In summer it hosts a festival that quadruples the population. In April it hosts us and a great many gulls.

We ate *percebes* — gooseneck barnacles — prised off these exact rocks by people who do that for a living in this exact surf, and paid what they cost, which is a lot, and which after watching the sea for four days seemed entirely reasonable.`,
        de: `Der Nordwind hat hier einen Namen — die *Nortada* — was immer ein Zeichen ist. Er kommt am Vormittag auf, baut sich den ganzen Nachmittag auf, und um zwei hat man aufgehört, den Hut halten zu wollen.

Nach Süden hat man ihn im Rücken, was das beste Argument dafür ist, diesen Weg in dieser Richtung zu laufen. Achtzehn Kilometer heute, und der Wind hat etwa vier davon für uns übernommen.

[photo:1]

Zambujeira sitzt auf einem Sims über seinem eigenen kleinen Strand: eine Kirche, ein Platz, drei Restaurants und ein Abgrund. Im Sommer findet hier ein Festival statt, das die Einwohnerzahl vervierfacht. Im April finden hier wir statt und sehr viele Möwen.

Wir aßen *Percebes* — Entenmuscheln —, von genau diesen Felsen gelöst von Leuten, die das in genau dieser Brandung beruflich tun, und zahlten, was sie kosten, nämlich viel, was nach vier Tagen Meerbeobachtung vollkommen angemessen schien.`,
      },
      route: {
        profile: "foot",
        name: { en: "Almograve → Zambujeira do Mar", de: "Almograve → Zambujeira do Mar" },
        waypoints: [
          [-8.8, 37.65],
          [-8.8189, 37.5967],
          [-8.786, 37.53],
        ],
      },
      photos: [
        {
          search: "Zambujeira do Mar",
          lat: 37.53,
          lng: -8.786,
          caption: {
            en: "Zambujeira do Mar from the north approach.",
            de: "Zambujeira do Mar vom Anstieg im Norden.",
          },
        },
        {
          file: "Odemira - Zambujeira do Mar-7 (48884591513).jpg",
          lat: 37.535,
          lng: -8.79,
          caption: {
            en: "The Nortada, doing its afternoon work.",
            de: "Die Nortada bei ihrer Nachmittagsarbeit.",
          },
        },
      ],
      comments: [
        { author: "Ana", days: 1, body: { en: "Percebes are worth every cent and the price is entirely about the risk of collecting them.", de: "Percebes sind jeden Cent wert, und der Preis erklärt sich komplett aus dem Risiko beim Sammeln." } },
        { author: "Hendrik", days: 4, body: { en: "The Nortada in July is a different animal. April is the sweet spot.", de: "Die Nortada im Juli ist ein anderes Tier. April ist der Sweet Spot." } },
      ],
    },
    {
      slug: "odeceixe-river-mouth",
      date: "2025-04-16",
      place: "Odeceixe, Algarve",
      lat: 37.436,
      lng: -8.771,
      title: { en: "Odeceixe, Where the River Wins", de: "Odeceixe, wo der Fluss gewinnt" },
      excerpt: {
        en: "A last stage over the regional border, ending at a beach with a river running down the middle of it.",
        de: "Eine letzte Etappe über die Regionsgrenze, mit Ziel an einem Strand, durch dessen Mitte ein Fluss läuft.",
      },
      body: {
        en: `The last stage crosses out of the Alentejo into the Algarve, which on the ground means nothing changes at all except the signs.

Odeceixe's beach is the trick ending: the Seixe river comes down a small gorge and meets the Atlantic head-on, and the two of them have negotiated a beach with fresh water on one side, salt on the other, and a sandbar in the middle that moves every winter. Children swim on the warm side. Surfers work the cold one.

[photo:1]

Four days. Sixty-some kilometres, most of them in sand, and I have rarely been so pleased to take boots off.

[photo:2]

The trail carries on south to Cabo de São Vicente, the southwestern corner of Europe, and standing at the Odeceixe river mouth with a beer I could see exactly how people end up doing the whole thing.`,
        de: `Die letzte Etappe führt aus dem Alentejo in die Algarve, was vor Ort bedeutet: Es ändert sich nichts außer den Schildern.

Der Strand von Odeceixe ist die Pointe: Der Seixe kommt durch eine kleine Schlucht herunter und trifft frontal auf den Atlantik, und die beiden haben einen Strand ausgehandelt — Süßwasser auf der einen Seite, Salz auf der anderen und dazwischen eine Sandbank, die jeden Winter wandert. Kinder schwimmen auf der warmen Seite. Surfer arbeiten auf der kalten.

[photo:1]

Vier Tage. Gut sechzig Kilometer, die meisten im Sand, und selten habe ich Stiefel so gern ausgezogen.

[photo:2]

Der Weg geht weiter nach Süden bis zum Cabo de São Vicente, der Südwestecke Europas, und als ich mit einem Bier an der Mündung des Seixe stand, sah ich genau, wie Leute dazu kommen, das Ganze zu laufen.`,
      },
      route: {
        profile: "foot",
        name: { en: "Zambujeira do Mar → Odeceixe", de: "Zambujeira do Mar → Odeceixe" },
        waypoints: [
          [-8.786, 37.53],
          [-8.7900, 37.4900],
          [-8.7710, 37.436],
        ],
      },
      photos: [
        {
          search: "Praia de Odeceixe",
          lat: 37.4425,
          lng: -8.7975,
          caption: {
            en: "Praia de Odeceixe. River left, Atlantic right.",
            de: "Praia de Odeceixe. Links Fluss, rechts Atlantik.",
          },
        },
        {
          search: "Odeceixe Algarve village",
          lat: 37.436,
          lng: -8.771,
          caption: {
            en: "Odeceixe village, and the end of the walking.",
            de: "Das Dorf Odeceixe — und das Ende des Laufens.",
          },
        },
      ],
      comments: [
        { author: "Rui", days: 2, body: { en: "Carry on to São Vicente next time. Another six days and the last two are the best of the lot.", de: "Nächstes Mal weiter bis São Vicente. Sechs Tage mehr, und die letzten zwei sind die besten." } },
        { author: "Marta", days: 6, body: { en: "Just booked April for next year because of this. Thank you.", de: "Habe deswegen gerade April fürs nächste Jahr gebucht. Danke." } },
      ],
    },
  ],
};
