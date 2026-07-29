// Lofoten, February — the demo's "short trip, big weather" journey.
//
// Waypoints are real places on the E10; the fetch step snaps them to the road
// network, so the drawn line follows the actual causeways rather than cutting
// across the fjords. The journal itself is invented.

export const lofoten = {
  slug: "lofoten-winter-light",
  title: {
    en: "Lofoten in Winter Light",
    de: "Lofoten im Winterlicht",
  },
  summary: {
    en: "Eleven days on the E10 in February, chasing four hours of daylight from Svolvær to the last house in Å.",
    de: "Elf Tage auf der E10 im Februar, vier Stunden Tageslicht hinterher — von Svolvær bis zum letzten Haus in Å.",
  },
  start: "2023-02-04",
  end: "2023-02-15",
  posts: [
    {
      slug: "svolvaer-first-light",
      date: "2023-02-05",
      place: "Svolvær, Nordland",
      lat: 68.2344,
      lng: 14.5646,
      title: { en: "Four Hours of Daylight", de: "Vier Stunden Tageslicht" },
      excerpt: {
        en: "The plane drops through cloud and there they are: black teeth in a white sea.",
        de: "Das Flugzeug fällt durch die Wolken, und da stehen sie: schwarze Zähne in einem weißen Meer.",
      },
      body: {
        en: `The plane comes in low over Vestfjorden and the islands arrive all at once — black teeth in a white sea, no foothills, no warning. Somebody two rows back says *oh* out loud and nobody laughs.

Svolvær in February gets light around half past nine and gives it back before three. You learn to plan around that fast. We picked up the car, bought more wool than we needed, and drove out to Henningsvær with the sun already going orange at eleven in the morning.

[photo:1]

The trick, the woman at the rental desk told us, is not to fight the dark. Drive in it. Walk in it. The four hours in the middle are for looking.`,
        de: `Das Flugzeug kommt tief über den Vestfjorden herein, und die Inseln sind plötzlich alle auf einmal da — schwarze Zähne in einem weißen Meer, kein Vorgebirge, keine Vorwarnung. Zwei Reihen hinter uns sagt jemand laut *oh*, und niemand lacht.

Svolvær bekommt im Februar gegen halb zehn Licht und gibt es vor drei wieder her. Man lernt schnell, damit zu planen. Wir haben den Wagen geholt, mehr Wolle gekauft als nötig, und sind nach Henningsvær rausgefahren, während die Sonne um elf Uhr vormittags schon orange wurde.

[photo:1]

Der Trick, sagte die Frau am Mietschalter, ist, sich nicht gegen die Dunkelheit zu wehren. Fahr darin. Lauf darin. Die vier Stunden in der Mitte sind zum Schauen da.`,
      },
      route: {
        profile: "car",
        name: { en: "Svolvær → Henningsvær", de: "Svolvær → Henningsvær" },
        waypoints: [
          [14.5646, 68.2344],
          [14.3939, 68.1856],
          [14.2044, 68.1533],
        ],
      },
      photos: [
        {
          file: "Henningsvær 03.jpg",
          lat: 68.1533,
          lng: 14.2044,
          caption: {
            en: "Henningsvær, just after noon. This is as bright as it got.",
            de: "Henningsvær, kurz nach Mittag. Heller wurde es nicht.",
          },
        },
        {
          search: "Svolvær harbour Lofoten",
          lat: 68.2344,
          lng: 14.5646,
          caption: {
            en: "Svolvær harbour, blue hour — which in February is most hours.",
            de: "Hafen von Svolvær, blaue Stunde — die im Februar die meisten Stunden sind.",
          },
        },
      ],
      ask: {
        kind: "poll",
        question: {
          en: "Winter trip north of the Arctic Circle — what would you book first?",
          de: "Winterreise nördlich des Polarkreises — was würdest du zuerst buchen?",
        },
        options: {
          en: ["A rorbu with a wood stove", "A car with studded tyres", "A guided aurora night", "Nothing — decide on arrival"],
          de: ["Ein Rorbu mit Holzofen", "Ein Auto mit Spikes", "Eine geführte Polarlichtnacht", "Nichts — vor Ort entscheiden"],
        },
      },
      comments: [
        { author: "Marit", days: 2, body: { en: "Studded tyres. Not optional in February, whatever the rental desk says.", de: "Spikes. Im Februar keine Option, egal was der Mietschalter sagt." } },
        { author: "Tom", days: 4, body: { en: "That second photo is exactly why I keep going back in winter instead of July.", de: "Genau wegen des zweiten Fotos fahre ich im Winter statt im Juli." } },
      ],
    },
    {
      slug: "unstad-and-the-cold-surfers",
      date: "2023-02-07",
      place: "Unstad, Vestvågøy",
      lat: 68.2497,
      lng: 13.6125,
      title: { en: "The Cold Surfers of Unstad", de: "Die kalten Surfer von Unstad" },
      excerpt: {
        en: "Two degrees in the water, minus six on the beach, and a queue for the break.",
        de: "Zwei Grad im Wasser, minus sechs am Strand — und Schlange am Peak.",
      },
      body: {
        en: `You hear Unstad before you see it: the road drops through a cut in the rock and the noise of the North Atlantic comes up to meet you.

There were nine surfers out. Nine. Two degrees in the water, minus six on the sand, and a tidy little queue forming at the peak like it was Biarritz in August. One of them came in, pulled the hood back, and was maybe sixteen.

[photo:2]

We watched for an hour with the engine running and the heater on, which I am not proud of.`,
        de: `Man hört Unstad, bevor man es sieht: Die Straße fällt durch einen Einschnitt im Fels, und der Lärm des Nordatlantiks kommt einem entgegen.

Neun Surfer waren draußen. Neun. Zwei Grad im Wasser, minus sechs im Sand, und am Peak bildete sich eine ordentliche kleine Schlange wie in Biarritz im August. Einer kam raus, zog die Kapuze zurück und war vielleicht sechzehn.

[photo:2]

Wir haben eine Stunde zugesehen, bei laufendem Motor und Heizung, worauf ich nicht stolz bin.`,
      },
      route: {
        profile: "car",
        name: { en: "Henningsvær → Unstad", de: "Henningsvær → Unstad" },
        waypoints: [
          [14.2044, 68.1533],
          [13.8935, 68.1350],
          [13.6120, 68.1470],
          [13.6125, 68.2497],
        ],
      },
      photos: [
        {
          file: "Unstad-06-Strand-2019-gje.jpg",
          lat: 68.2497,
          lng: 13.6125,
          caption: {
            en: "Unstad bay. The white on the right is spray, not snow.",
            de: "Bucht von Unstad. Das Weiß rechts ist Gischt, kein Schnee.",
          },
        },
        {
          search: "Haukland beach Lofoten",
          lat: 68.1930,
          lng: 13.5510,
          caption: {
            en: "Haukland, ten minutes south. Empty, and about four degrees warmer.",
            de: "Haukland, zehn Minuten südlich. Leer — und etwa vier Grad wärmer.",
          },
        },
      ],
      comments: [
        { author: "Ingrid", days: 3, body: { en: "The sixteen-year-old is probably Unstad's third generation. They start them early up there.", de: "Der Sechzehnjährige ist vermutlich Unstads dritte Generation. Die fangen da oben früh an." } },
      ],
    },
    {
      slug: "nusfjord-in-the-dark",
      date: "2023-02-09",
      place: "Nusfjord, Flakstadøya",
      lat: 68.0333,
      lng: 13.3500,
      title: { en: "Nusfjord, and Learning to Wait", de: "Nusfjord, und das Warten lernen" },
      excerpt: {
        en: "A fishing village with eleven residents and a cod-liver oil factory that still smells of 1890.",
        de: "Ein Fischerdorf mit elf Einwohnern und einer Tranfabrik, die noch nach 1890 riecht.",
      },
      body: {
        en: `Nusfjord has eleven year-round residents and one of the best-preserved rorbu harbours in Norway, which means in summer it has approximately eleven thousand. In February it has us and a man mending a door.

The cod-liver oil factory is open. It smells, precisely and unmistakably, of 1890.

We had come for the light and there was none — a flat grey lid all day, the kind that makes the sea and the sky the same object. So we sat in the car and waited, and at ten past two the lid cracked open over Vestfjorden for maybe six minutes.

[photo:1]

Six minutes is plenty. That's the whole lesson of this island in winter.`,
        de: `Nusfjord hat elf ganzjährige Einwohner und einen der besterhaltenen Rorbu-Häfen Norwegens, was bedeutet: im Sommer hat es ungefähr elftausend. Im Februar hat es uns und einen Mann, der eine Tür repariert.

Die Tranfabrik ist geöffnet. Sie riecht, präzise und unverkennbar, nach 1890.

Wir waren wegen des Lichts gekommen, und es gab keins — den ganzen Tag ein flacher grauer Deckel, die Sorte, die Meer und Himmel zum selben Gegenstand macht. Also saßen wir im Auto und warteten, und um zehn nach zwei riss der Deckel über dem Vestfjorden auf, vielleicht sechs Minuten lang.

[photo:1]

Sechs Minuten reichen. Das ist die ganze Lektion dieser Insel im Winter.`,
      },
      route: {
        profile: "car",
        name: { en: "Leknes → Nusfjord", de: "Leknes → Nusfjord" },
        waypoints: [
          [13.6120, 68.1470],
          [13.4400, 68.0900],
          [13.3500, 68.0333],
        ],
      },
      photos: [
        {
          search: "Nusfjord Lofoten",
          lat: 68.0333,
          lng: 13.3500,
          caption: {
            en: "The six minutes. Nusfjord harbour, 14:10.",
            de: "Die sechs Minuten. Hafen von Nusfjord, 14:10 Uhr.",
          },
        },
      ],
      ask: {
        kind: "quiz",
        question: {
          en: "Those red rorbuer are painted with a traditional Nordic pigment. What made it cheap?",
          de: "Die roten Rorbuer sind mit einem traditionellen nordischen Pigment gestrichen. Warum war es billig?",
        },
        options: {
          en: ["It was a by-product of copper mining", "It was made from dried cod blood", "It was imported as ballast", "It was scraped from iron-rich cliffs"],
          de: ["Nebenprodukt des Kupferbergbaus", "Aus getrocknetem Kabeljaublut", "Kam als Ballast ins Land", "Von eisenhaltigen Klippen gekratzt"],
        },
        correctIndex: 0,
        explanation: {
          en: "Falu red comes from the tailings of the Falun copper mine in Sweden — waste from one industry became the cheapest paint in Scandinavia, and then its signature colour.",
          de: "Falunrot stammt aus den Abraumhalden der Kupfergrube Falun in Schweden — der Abfall einer Industrie wurde zur billigsten Farbe Skandinaviens und dann zu seiner Signaturfarbe.",
        },
      },
      comments: [
        { author: "Petra", days: 1, body: { en: "\"Six minutes is plenty\" — writing that on a sticky note for my next photography trip.", de: "„Sechs Minuten reichen“ — das kommt auf einen Zettel für meine nächste Fotoreise." } },
        { author: "Lars", days: 6, body: { en: "Got the paint question wrong and I'm Swedish. Shameful.", de: "Habe die Farbfrage falsch beantwortet, und ich bin Schwede. Beschämend." } },
      ],
    },
    {
      slug: "reine-and-the-aurora",
      date: "2023-02-11",
      place: "Reine, Moskenesøya",
      lat: 67.9330,
      lng: 13.0890,
      title: { en: "Reine, and the Night It Finally Worked", de: "Reine, und die Nacht, in der es endlich klappte" },
      excerpt: {
        en: "Six nights of cloud, then twenty minutes that rearranged the sky.",
        de: "Sechs Nächte Wolken, dann zwanzig Minuten, die den Himmel umgeräumt haben.",
      },
      body: {
        en: `Six nights of cloud. We had reached the stage of checking three different aurora forecasts and believing none of them.

Then on the seventh the wind swung round and by nine the sky over Hamnøy was doing the thing everyone shows you photos of, except faster — a band tightening and folding like something alive, green going to a colour I don't have a word for, over water flat enough to take all of it twice.

[photo:1]

It lasted about twenty minutes. Afterwards nobody on the bridge said anything for a while, which felt right.

[photo:2]

I understand now why people come back.`,
        de: `Sechs Nächte Wolken. Wir waren an dem Punkt, drei verschiedene Polarlicht-Vorhersagen zu prüfen und keiner zu glauben.

Dann drehte in der siebten der Wind, und um neun tat der Himmel über Hamnøy das, wovon einem alle Fotos zeigen, nur schneller — ein Band, das sich zusammenzog und faltete wie etwas Lebendiges, Grün, das in eine Farbe überging, für die ich kein Wort habe, über Wasser, das flach genug war, um alles zweimal zu nehmen.

[photo:1]

Es dauerte etwa zwanzig Minuten. Danach sagte auf der Brücke eine Weile niemand etwas, was sich richtig anfühlte.

[photo:2]

Jetzt verstehe ich, warum Leute wiederkommen.`,
      },
      route: {
        profile: "car",
        name: { en: "Nusfjord → Reine", de: "Nusfjord → Reine" },
        waypoints: [
          [13.3500, 68.0333],
          [13.1330, 67.9490],
          [13.0890, 67.9330],
        ],
      },
      photos: [
        {
          search: "Northern lights Lofoten",
          lat: 67.9490,
          lng: 13.1330,
          caption: {
            en: "Hamnøy, 21:14. Fifteen seconds at f/2.8 and I still clipped the highlights.",
            de: "Hamnøy, 21:14 Uhr. Fünfzehn Sekunden bei f/2,8 — und die Lichter sind trotzdem ausgefressen.",
          },
        },
        {
          file: "Reine, Lilandstinden and Festhæltinden in Moskenes, Nordland, Norway, 2015 September.jpg",
          lat: 67.9330,
          lng: 13.0890,
          caption: {
            en: "Reine the next morning, behaving itself.",
            de: "Reine am nächsten Morgen, ganz brav.",
          },
        },
      ],
      comments: [
        { author: "Anouk", days: 2, body: { en: "Twenty minutes is a long show. We waited nine nights and got four.", de: "Zwanzig Minuten sind eine lange Vorstellung. Wir haben neun Nächte gewartet und vier bekommen." } },
        { author: "Jonas", days: 3, body: { en: "Which forecast did you end up trusting?", de: "Welcher Vorhersage hast du am Ende geglaubt?" } },
        { author: "Marit", days: 5, body: { en: "None of them. That's the correct answer.", de: "Keiner. Das ist die richtige Antwort." } },
      ],
    },
    {
      slug: "the-end-of-the-road-at-aa",
      date: "2023-02-14",
      place: "Å i Lofoten",
      lat: 67.8811,
      lng: 12.9769,
      title: { en: "Å — The End of the Road", de: "Å — das Ende der Straße" },
      excerpt: {
        en: "The E10 runs 850 kilometres and stops in a car park at a village named after one letter.",
        de: "Die E10 läuft 850 Kilometer und endet auf einem Parkplatz in einem Dorf, das nach einem Buchstaben heißt.",
      },
      body: {
        en: `The E10 starts in Sweden, crosses the border, island-hops the whole archipelago on causeways and through tunnels drilled under the sea, and then stops. Car park. Fence. Sea.

The village is called Å. One letter, last in the Norwegian alphabet, which is either a wonderful coincidence or the driest joke in Nordland.

We walked to the end of the fence in the dark and stood there, and there was nothing beyond it but Værøy somewhere out in the black and then the open Atlantic all the way to Iceland.

[photo:1]

Eleven days. Four hours of daylight a day, and it turns out that's about right.`,
        de: `Die E10 beginnt in Schweden, überquert die Grenze, hüpft über Dämme und durch unter dem Meer gebohrte Tunnel den ganzen Archipel entlang — und hört dann auf. Parkplatz. Zaun. Meer.

Das Dorf heißt Å. Ein Buchstabe, der letzte im norwegischen Alphabet, was entweder ein wunderbarer Zufall ist oder der trockenste Witz Nordlands.

Wir sind im Dunkeln bis ans Ende des Zauns gelaufen und standen da, und dahinter war nichts als Værøy irgendwo im Schwarzen und dann der offene Atlantik bis Island.

[photo:1]

Elf Tage. Vier Stunden Tageslicht am Tag — und es stellt sich heraus: das reicht.`,
      },
      route: {
        profile: "car",
        name: { en: "Reine → Å", de: "Reine → Å" },
        waypoints: [
          [13.0890, 67.9330],
          [13.0100, 67.9000],
          [12.9769, 67.8811],
        ],
      },
      photos: [
        {
          search: "Å i Lofoten village",
          lat: 67.8811,
          lng: 12.9769,
          caption: {
            en: "Å. The road ends roughly where this photo does.",
            de: "Å. Die Straße endet ungefähr da, wo dieses Foto endet.",
          },
        },
        {
          search: "Moskenes Lofoten winter",
          lat: 67.9000,
          lng: 13.0100,
          caption: {
            en: "Moskenes, on the way down. Last of the light.",
            de: "Moskenes, auf dem Weg nach unten. Der Rest des Lichts.",
          },
        },
      ],
      comments: [
        { author: "Tom", days: 1, body: { en: "Did the Å museum bakery have the cinnamon buns going? Best thing on the island.", de: "Hatte die Museumsbäckerei in Å Zimtschnecken? Das Beste auf der Insel." } },
      ],
    },
  ],
};
