// The Carretera Austral, Chilean Patagonia — the demo's long, dusty journey.
//
// Ruta 7 is genuinely a road, ferries and all, so the routing step follows it.
// Where a leg crosses water the router uses the mapped ferry lines; if it can't,
// the fetch script says so rather than quietly drawing a straight line.

export const carreteraAustral = {
  slug: "carretera-austral",
  title: {
    en: "The Carretera Austral, End to End",
    de: "Die Carretera Austral, von Anfang bis Ende",
  },
  summary: {
    en: "1,240 kilometres of gravel, ferries and rain from Puerto Montt to the last village before the ice cap. Three weeks, one spare tyre used.",
    de: "1.240 Kilometer Schotter, Fähren und Regen von Puerto Montt bis ins letzte Dorf vor dem Eisfeld. Drei Wochen, ein Ersatzreifen verbraucht.",
  },
  start: "2024-01-06",
  end: "2024-01-27",
  posts: [
    {
      slug: "puerto-montt-to-hornopiren",
      date: "2024-01-07",
      place: "Hornopirén, Los Lagos",
      lat: -41.95,
      lng: -72.4333,
      title: { en: "Kilometre Zero", de: "Kilometer null" },
      excerpt: {
        en: "A road that is thirty percent ferry, and nobody warns you in that order.",
        de: "Eine Straße, die zu dreißig Prozent Fähre ist — und niemand sagt das in dieser Reihenfolge.",
      },
      body: {
        en: `The Carretera Austral is not really one road. It is a series of roads with water in between, and the water is on a timetable.

We learned this at La Arena at seven in the morning, in a queue of four cars, two trucks and a man with a horse trailer who had clearly done this every week of his life. The crossing takes half an hour. The next one, further south, takes five hours and you book it weeks ahead or you don't go.

[photo:1]

Hornopirén by evening: volcano behind, fjord in front, and a hospedaje where the owner asked how far we were going and then laughed in a way I'd think about for the next fortnight.`,
        de: `Die Carretera Austral ist eigentlich keine Straße. Sie ist eine Reihe von Straßen mit Wasser dazwischen, und das Wasser hat einen Fahrplan.

Gelernt haben wir das um sieben Uhr morgens in La Arena, in einer Schlange aus vier Autos, zwei Lastern und einem Mann mit Pferdeanhänger, der das offensichtlich jede Woche seines Lebens tat. Die Überfahrt dauert eine halbe Stunde. Die nächste, weiter südlich, dauert fünf Stunden, und man bucht sie Wochen vorher oder fährt eben nicht.

[photo:1]

Abends Hornopirén: Vulkan im Rücken, Fjord davor, und eine Hospedaje, deren Wirt fragte, wie weit wir wollten, und dann auf eine Art lachte, über die ich die nächsten zwei Wochen nachdachte.`,
      },
      route: {
        profile: "car",
        name: { en: "Puerto Montt → Hornopirén", de: "Puerto Montt → Hornopirén" },
        waypoints: [
          [-72.9424, -41.4693],
          [-72.7500, -41.6000],
          [-72.4333, -41.95],
        ],
      },
      photos: [
        {
          search: "Hornopirén Chile",
          lat: -41.95,
          lng: -72.4333,
          caption: {
            en: "Hornopirén. The volcano is 1,572 m and does not look it from here.",
            de: "Hornopirén. Der Vulkan hat 1.572 m und sieht von hier nicht danach aus.",
          },
        },
        {
          search: "Reloncaví fjord Chile",
          lat: -41.6,
          lng: -72.55,
          caption: {
            en: "Estuario de Reloncaví, waiting for the La Arena ferry.",
            de: "Estuario de Reloncaví, Warten auf die Fähre in La Arena.",
          },
        },
      ],
      ask: {
        kind: "poll",
        question: {
          en: "Three weeks on gravel. What's your vehicle?",
          de: "Drei Wochen Schotter. Womit fährst du?",
        },
        options: {
          en: ["A 4×4 with a rooftop tent", "The cheapest rental that will take it", "A bicycle, obviously", "Buses and hitching"],
          de: ["4×4 mit Dachzelt", "Der billigste Mietwagen, der es aushält", "Fahrrad, natürlich", "Bus und per Anhalter"],
        },
      },
      comments: [
        { author: "Sofía", days: 3, body: { en: "The five-hour one is Leptepu–Fiordo Largo. Book it the day the schedule opens, not before.", de: "Die fünfstündige ist Leptepu–Fiordo Largo. Am Tag der Fahrplanfreigabe buchen, nicht früher." } },
      ],
    },
    {
      slug: "queulat-hanging-glacier",
      date: "2024-01-12",
      place: "Puyuhuapi, Aysén",
      lat: -44.325,
      lng: -72.56,
      title: { en: "The Glacier That Hangs", de: "Der Gletscher, der hängt" },
      excerpt: {
        en: "Rain for two days, then a window, and a sheet of ice sitting in a notch 400 metres up.",
        de: "Zwei Tage Regen, dann ein Fenster — und eine Eisplatte, die 400 Meter hoch in einer Scharte klebt.",
      },
      body: {
        en: `Queulat gets around four metres of rain a year, and we arrived for about eleven centimetres of it.

The Ventisquero Colgante is exactly what it says: a hanging glacier, a slab of ice wedged in a notch in the cliff with nothing under it, dropping meltwater 400 metres into a lagoon in two thin white ropes. On the second morning the cloud lifted for maybe forty minutes and the whole thing appeared at once, which the six of us on the mirador took very personally.

[photo:1]

Then it closed again like a shop.

The valley south of here is the greenest place I have ever driven through. Ferns above head height at the roadside. It rains, and everything simply says thank you.`,
        de: `Queulat bekommt rund vier Meter Regen im Jahr, und wir kamen für ungefähr elf Zentimeter davon.

Der Ventisquero Colgante ist genau das, was der Name sagt: ein hängender Gletscher, eine Eisplatte, in eine Felsscharte geklemmt, mit nichts darunter, die ihr Schmelzwasser in zwei dünnen weißen Seilen 400 Meter tief in eine Lagune fallen lässt. Am zweiten Morgen hob sich die Wolke für vielleicht vierzig Minuten, und alles erschien auf einmal, was wir sechs auf dem Mirador sehr persönlich nahmen.

[photo:1]

Dann schloss es wieder wie ein Laden.

Das Tal südlich davon ist der grünste Ort, durch den ich je gefahren bin. Farne über Kopfhöhe am Straßenrand. Es regnet, und alles sagt einfach danke.`,
      },
      route: {
        profile: "car",
        name: { en: "Chaitén → Puyuhuapi", de: "Chaitén → Puyuhuapi" },
        waypoints: [
          [-72.7167, -42.9167],
          [-72.4200, -43.4500],
          [-72.5400, -44.1500],
          [-72.5600, -44.325],
        ],
      },
      photos: [
        {
          search: "Ventisquero Colgante Queulat",
          lat: -44.4667,
          lng: -72.5667,
          caption: {
            en: "The forty minutes. Ventisquero Colgante, Parque Nacional Queulat.",
            de: "Die vierzig Minuten. Ventisquero Colgante, Nationalpark Queulat.",
          },
        },
        {
          file: "Bahia de Puyuhuapi.jpg",
          lat: -44.325,
          lng: -72.56,
          caption: {
            en: "Bahía Puyuhuapi. The Ruta 7 runs along the far shore.",
            de: "Bahía Puyuhuapi. Die Ruta 7 läuft am anderen Ufer entlang.",
          },
        },
      ],
      comments: [
        { author: "Bruno", days: 5, body: { en: "Four metres of rain and people still call this the dry side of the Andes. Wild.", de: "Vier Meter Regen, und trotzdem heißt das die trockene Seite der Anden. Irre." } },
        { author: "Karin", days: 8, body: { en: "\"Then it closed again like a shop\" made me laugh out loud on a train.", de: "„Dann schloss es wieder wie ein Laden“ — ich habe im Zug laut gelacht." } },
      ],
    },
    {
      slug: "cerro-castillo-traverse",
      date: "2024-01-16",
      place: "Cerro Castillo, Aysén",
      lat: -46.1167,
      lng: -72.1667,
      title: { en: "Over Cerro Castillo", de: "Über den Cerro Castillo" },
      excerpt: {
        en: "Up through beech forest to a lagoon the colour of antifreeze, with the wind doing its best to send us back.",
        de: "Durch den Südbuchenwald hinauf zu einer Lagune in Frostschutzmittelblau, während der Wind sein Bestes gab, uns zurückzuschicken.",
      },
      body: {
        en: `We left the car in Villa Cerro Castillo and walked up. The guidebook calls the first section "sustained". The guidebook is being polite.

Four hours of scree and beech forest and then the Laguna Cerro Castillo appears below the spires, that impossible mineral turquoise, with a small glacier still calving pieces the size of dinner tables into it.

[photo:1]

The wind on the col was the strongest I have stood up in. You lean into it and it holds you, and then it stops holding you, which is the part to watch.

[ask:1]

Down in seven hours total. Legs gone. Worth every metre.`,
        de: `Wir ließen das Auto in Villa Cerro Castillo stehen und liefen hoch. Der Führer nennt den ersten Abschnitt „anhaltend“. Der Führer ist höflich.

Vier Stunden Geröll und Südbuchenwald, dann taucht unter den Türmen die Laguna Cerro Castillo auf, dieses unmögliche mineralische Türkis, und ein kleiner Gletscher kalbt immer noch Stücke von Tischgröße hinein.

[photo:1]

Der Wind auf dem Sattel war der stärkste, in dem ich je gestanden habe. Man lehnt sich hinein, und er hält einen — und dann hält er einen nicht mehr, und das ist der Teil, auf den man achten muss.

[ask:1]

Insgesamt sieben Stunden. Beine hin. Jeden Meter wert.`,
      },
      route: {
        profile: "foot",
        name: { en: "Laguna Cerro Castillo", de: "Laguna Cerro Castillo" },
        waypoints: [
          [-72.1667, -46.1167],
          [-72.2100, -46.1000],
          [-72.2400, -46.0850],
        ],
      },
      photos: [
        {
          search: "Cerro Castillo Chile laguna",
          lat: -46.085,
          lng: -72.24,
          caption: {
            en: "Laguna Cerro Castillo. The colour is real and the camera undersells it.",
            de: "Laguna Cerro Castillo. Die Farbe ist echt, und die Kamera untertreibt.",
          },
        },
        {
          search: "Cerro Castillo National Park",
          lat: -46.1,
          lng: -72.21,
          caption: {
            en: "The spires from the approach, before the wind found us.",
            de: "Die Türme vom Anstieg aus, bevor uns der Wind fand.",
          },
        },
      ],
      ask: {
        kind: "quiz",
        question: {
          en: "Glacial lakes are that turquoise because of what, exactly?",
          de: "Woran genau liegt dieses Türkis von Gletscherseen?",
        },
        options: {
          en: ["Dissolved copper salts", "Suspended rock flour scattering light", "Algae blooming in cold water", "Reflected sky, nothing more"],
          de: ["Gelöste Kupfersalze", "Schwebende Gletschermilch streut das Licht", "Algenblüte im kalten Wasser", "Nur der gespiegelte Himmel"],
        },
        correctIndex: 1,
        explanation: {
          en: "Glaciers grind bedrock into a flour of particles a few microns across. Suspended in meltwater, they scatter the blue-green end of the spectrum straight back at you — which is why the colour survives even under a grey sky.",
          de: "Gletscher mahlen Fels zu einem Mehl aus wenigen Mikrometer großen Partikeln. In Schmelzwasser geschwebt, streuen sie das blaugrüne Ende des Spektrums direkt zurück — deshalb hält die Farbe auch unter grauem Himmel.",
        },
      },
      comments: [
        { author: "Rodrigo", days: 2, body: { en: "Did the full four-day traverse in 2019. The col is no joke when it's blowing. Glad you turned it into a day.", de: "Habe 2019 die ganze Vier-Tage-Durchquerung gemacht. Der Sattel ist kein Spaß bei Wind. Gut, dass ihr einen Tag draus gemacht habt." } },
      ],
    },
    {
      slug: "marble-caves-general-carrera",
      date: "2024-01-19",
      place: "Puerto Río Tranquilo, Aysén",
      lat: -46.625,
      lng: -72.6667,
      title: { en: "Six Thousand Years of Water Sanding a Wall", de: "Sechstausend Jahre Wasser, das eine Wand schleift" },
      excerpt: {
        en: "A boat, a headland of marble, and light coming up through the lake into the caves.",
        de: "Ein Boot, eine Landzunge aus Marmor — und Licht, das durch den See nach oben in die Höhlen steigt.",
      },
      body: {
        en: `Lago General Carrera is the second-largest lake in South America and the wind can turn it into something with actual surf, so the boats go early or not at all.

We went at eight. The Capillas de Mármol are a headland of calcium carbonate that the lake has spent six thousand years sanding into colonnades and vaults, and the extraordinary part isn't the shape — it's that the water is clear enough to act as a light source. Blue comes *up* through it into the caves and moves on the ceiling.

[photo:1]

Our boatman had done this run for eleven years and still cut the engine in the big chamber so we could hear it. Good man.`,
        de: `Der Lago General Carrera ist der zweitgrößte See Südamerikas, und der Wind kann ihn in etwas mit echtem Wellengang verwandeln — also fahren die Boote früh oder gar nicht.

Wir fuhren um acht. Die Capillas de Mármol sind eine Landzunge aus Kalziumkarbonat, die der See in sechstausend Jahren zu Kolonnaden und Gewölben geschliffen hat, und das Außergewöhnliche ist nicht die Form — es ist, dass das Wasser klar genug ist, um selbst als Lichtquelle zu dienen. Blau steigt *durch* es hinauf in die Höhlen und wandert über die Decke.

[photo:1]

Unser Bootsführer machte diese Fahrt seit elf Jahren und stellte in der großen Kammer trotzdem den Motor ab, damit wir es hören konnten. Guter Mann.`,
      },
      route: {
        profile: "car",
        name: { en: "Cerro Castillo → Puerto Río Tranquilo", de: "Cerro Castillo → Puerto Río Tranquilo" },
        waypoints: [
          [-72.1667, -46.1167],
          [-72.0500, -46.4000],
          [-72.6667, -46.625],
        ],
      },
      photos: [
        {
          search: "Marble Caves Chile Capillas de Marmol",
          lat: -46.65,
          lng: -72.7,
          caption: {
            en: "Catedral de Mármol. The light is coming from below.",
            de: "Catedral de Mármol. Das Licht kommt von unten.",
          },
        },
        {
          search: "Lago General Carrera",
          lat: -46.625,
          lng: -72.6667,
          caption: {
            en: "Lago General Carrera at seven in the morning, before the wind.",
            de: "Lago General Carrera um sieben Uhr morgens, vor dem Wind.",
          },
        },
      ],
      comments: [
        { author: "Elena", days: 4, body: { en: "Go at eight. Everyone says it and everyone is right — by eleven it's chop and queues.", de: "Fahrt um acht. Alle sagen das, und alle haben recht — um elf sind es Wellen und Schlangen." } },
        { author: "Bruno", days: 9, body: { en: "Kayaked it instead. Slower, colder, better.", de: "Wir sind stattdessen gepaddelt. Langsamer, kälter, besser." } },
      ],
    },
    {
      slug: "villa-o-higgins-the-end",
      date: "2024-01-25",
      place: "Villa O'Higgins, Aysén",
      lat: -48.4667,
      lng: -72.5667,
      title: { en: "Villa O'Higgins, and Then Nothing", de: "Villa O'Higgins, und dann nichts" },
      excerpt: {
        en: "The road stops at a village of 600 people because the third-largest body of ice on Earth is in the way.",
        de: "Die Straße endet in einem Dorf mit 600 Einwohnern, weil die drittgrößte Eismasse der Erde im Weg liegt.",
      },
      body: {
        en: `Ruta 7 ends here. Not "becomes difficult" — ends. Beyond Villa O'Higgins is the Campo de Hielo Sur, the third-largest continuous ice on the planet after Antarctica and Greenland, and you do not put a road through that.

To carry on to Argentina you take a boat down Lago O'Higgins, walk about 20 kilometres across the border with your bags, and pick up another boat on the far side. People do it. We watched four cyclists load up for it, all grinning like idiots, all clearly a bit frightened.

[photo:1]

1,240 kilometres from Puerto Montt. Three weeks. One spare tyre, two ferries booked in a panic, and about nine days of rain.

The hospedaje owner in Hornopirén was right to laugh, and also completely wrong.`,
        de: `Hier endet die Ruta 7. Nicht „wird schwierig“ — endet. Hinter Villa O'Higgins liegt das Campo de Hielo Sur, die drittgrößte zusammenhängende Eismasse des Planeten nach Antarktis und Grönland, und da baut man keine Straße durch.

Wer nach Argentinien weiter will, nimmt ein Boot über den Lago O'Higgins, läuft mit Gepäck rund 20 Kilometer über die Grenze und steigt drüben in ein zweites Boot. Leute machen das. Wir sahen vier Radfahrern beim Packen zu, alle grinsend wie Idioten, alle sichtlich ein bisschen verängstigt.

[photo:1]

1.240 Kilometer ab Puerto Montt. Drei Wochen. Ein Ersatzreifen, zwei panisch gebuchte Fähren und etwa neun Tage Regen.

Der Wirt in Hornopirén hatte recht mit dem Lachen — und lag gleichzeitig völlig daneben.`,
      },
      route: {
        profile: "car",
        name: { en: "Cochrane → Villa O'Higgins", de: "Cochrane → Villa O'Higgins" },
        waypoints: [
          [-72.5747, -47.2544],
          [-72.7000, -47.7000],
          [-72.5667, -48.4667],
        ],
      },
      photos: [
        {
          file: "Carretera Austral 2012.JPG",
          lat: -47.7,
          lng: -72.7,
          caption: {
            en: "The last of Ruta 7. Gravel all the way to the end.",
            de: "Das letzte Stück Ruta 7. Schotter bis zum Schluss.",
          },
        },
        {
          search: "Lago O'Higgins",
          lat: -48.55,
          lng: -72.6,
          caption: {
            en: "Lago O'Higgins. Argentina is somewhere past that ice.",
            de: "Lago O'Higgins. Argentinien liegt irgendwo hinter dem Eis.",
          },
        },
      ],
      comments: [
        { author: "Sofía", days: 2, body: { en: "Did the crossing to El Chaltén in 2022. Twenty kilometres with a loaded bike is a very long twenty kilometres.", de: "Bin 2022 nach El Chaltén rüber. Zwanzig Kilometer mit beladenem Rad sind sehr lange zwanzig Kilometer." } },
        { author: "Anouk", days: 6, body: { en: "This whole series has been a joy to follow. Thank you for the ferry logistics especially.", de: "Diese ganze Serie war eine Freude. Danke besonders für die Fähren-Logistik." } },
      ],
    },
  ],
};
