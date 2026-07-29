// Hokkaidō in October — the demo's autumn journey, and the one with the
// steepest elevation profile (the Asahidake leg climbs 600 m in 3 km).

export const hokkaido = {
  slug: "hokkaido-autumn",
  title: {
    en: "Hokkaidō, Ahead of the Snow",
    de: "Hokkaidō, dem Schnee voraus",
  },
  summary: {
    en: "Two weeks driving northeast in October, from the hills above Furano to the last road on the Shiretoko peninsula, staying just in front of the first snow.",
    de: "Zwei Wochen im Oktober nach Nordosten, von den Hügeln über Furano bis zur letzten Straße auf der Shiretoko-Halbinsel — immer knapp vor dem ersten Schnee.",
  },
  start: "2024-10-08",
  end: "2024-10-21",
  posts: [
    {
      slug: "furano-hills-after-season",
      date: "2024-10-09",
      place: "Furano, Hokkaidō",
      lat: 43.3421,
      lng: 142.3833,
      title: { en: "Furano, After the Lavender", de: "Furano, nach dem Lavendel" },
      excerpt: {
        en: "Everyone comes in July for purple fields. In October the same hills are ochre and empty.",
        de: "Alle kommen im Juli für lila Felder. Im Oktober sind dieselben Hügel ockerfarben und leer.",
      },
      body: {
        en: `Furano's whole reputation is a photograph taken in the second week of July: corduroy stripes of lavender running downhill towards the Tokachi range.

We came in October, which turns out to be the better deal. The fields are cut and ochre, the mountains have their first white on top, and the farm café that seats two hundred in summer had four people in it including us and the owner's dog.

[photo:1]

Drove the back roads north towards Biei in the afternoon. Every second bend has a single tree standing alone in a field with a name and a small car park, which sounds ridiculous until you see one.`,
        de: `Furanos ganzer Ruf ist ein Foto aus der zweiten Juliwoche: Kordstreifen aus Lavendel, die zum Tokachi-Gebirge hinunterlaufen.

Wir kamen im Oktober, und das ist offensichtlich das bessere Geschäft. Die Felder sind abgeerntet und ockerfarben, die Berge haben ihr erstes Weiß obendrauf, und im Bauernhofcafé, das im Sommer zweihundert Leute setzt, saßen vier — uns und den Hund der Wirtin eingerechnet.

[photo:1]

Nachmittags über die Nebenstraßen Richtung Biei. An jeder zweiten Kurve steht ein einzelner Baum allein auf einem Feld, mit Namen und kleinem Parkplatz, was lächerlich klingt, bis man einen sieht.`,
      },
      route: {
        profile: "car",
        name: { en: "Sapporo → Furano", de: "Sapporo → Furano" },
        waypoints: [
          [141.3545, 43.0618],
          [141.8900, 43.1500],
          [142.3833, 43.3421],
        ],
      },
      photos: [
        {
          file: "View over Furano with Mountain Backdrop - Furano - Hokkaido - Japan (48012227543).jpg",
          lat: 43.3421,
          lng: 142.3833,
          caption: {
            en: "The famous hills, doing something other than lavender.",
            de: "Die berühmten Hügel, die etwas anderes tun als Lavendel.",
          },
        },
        {
          file: "View over Biei from Hokusei-no-oka Observatory Park - Biei - Hokkaido - Japan (48023419687).jpg",
          lat: 43.5883,
          lng: 142.4661,
          caption: {
            en: "Between Furano and Biei. Somewhere back there is a very famous tree.",
            de: "Zwischen Furano und Biei. Irgendwo da hinten steht ein sehr berühmter Baum.",
          },
        },
      ],
      ask: {
        kind: "poll",
        question: {
          en: "Best time to visit a place that's famous for one season?",
          de: "Beste Zeit für einen Ort, der für eine Jahreszeit berühmt ist?",
        },
        options: {
          en: ["Peak season — that's the point", "A fortnight either side", "The exact opposite season", "Whenever the flights are cheap"],
          de: ["Hochsaison — genau darum geht's", "Zwei Wochen davor oder danach", "Die genau entgegengesetzte Saison", "Wann die Flüge billig sind"],
        },
      },
      comments: [
        { author: "Yuki", days: 3, body: { en: "October is the local secret. Also the only time you can park in Biei.", de: "Oktober ist das Geheimnis der Einheimischen. Und die einzige Zeit, in der man in Biei parken kann." } },
      ],
    },
    {
      slug: "asahidake-first-snow",
      date: "2024-10-12",
      place: "Asahidake, Daisetsuzan",
      lat: 43.6636,
      lng: 142.8542,
      title: { en: "First Snow on Asahidake", de: "Erster Schnee auf dem Asahidake" },
      excerpt: {
        en: "Hokkaidō's highest mountain, a steaming hillside, and autumn colour with a lid of white on it.",
        de: "Hokkaidōs höchster Berg, ein dampfender Hang und Herbstfarbe mit einem weißen Deckel darauf.",
      },
      body: {
        en: `Asahidake is 2,291 metres and the first place in Japan to get snow every year — usually late September, which the rest of the country finds mildly offensive.

The ropeway lifts you to 1,600 m in ten minutes and drops you into a different season. Below the station: red and gold *nanakamado* going over. Above it: white, and steam. The mountain vents sulphur out of a scar on its flank and the smell arrives before the view does.

[photo:1]

We walked the loop past the ponds and then a little further up the ridge until the path was properly iced and sense prevailed.

[ask:1]

Onsen in Yukomanbetsu afterwards, outdoors, snow landing in the water. Objectively one of the better hours of my life.`,
        de: `Der Asahidake ist 2.291 Meter hoch und bekommt als erster Ort Japans jedes Jahr Schnee — meist Ende September, was der Rest des Landes leicht anstößig findet.

Die Seilbahn hebt einen in zehn Minuten auf 1.600 m und setzt einen in einer anderen Jahreszeit ab. Darunter: rote und goldene *Nanakamado* am Verblühen. Darüber: Weiß, und Dampf. Der Berg bläst Schwefel aus einer Narbe in seiner Flanke, und der Geruch kommt vor der Aussicht an.

[photo:1]

Wir liefen die Runde an den Teichen vorbei und dann noch ein Stück den Grat hinauf, bis der Weg richtig vereist war und die Vernunft siegte.

[ask:1]

Danach Onsen in Yukomanbetsu, draußen, Schnee, der ins Wasser fällt. Objektiv eine der besseren Stunden meines Lebens.`,
      },
      route: {
        profile: "foot",
        name: { en: "Asahidake ropeway loop", de: "Asahidake — Rundweg an der Seilbahn" },
        waypoints: [
          [142.8542, 43.6636],
          [142.8600, 43.6700],
          [142.8480, 43.6750],
          [142.8542, 43.6636],
        ],
      },
      photos: [
        {
          search: "Asahidake Hokkaido",
          lat: 43.6636,
          lng: 142.8542,
          caption: {
            en: "Asahidake with its first snow and its permanent steam.",
            de: "Asahidake mit erstem Schnee und permanentem Dampf.",
          },
        },
        {
          file: "Daisetsuzan Volcanic Group seen from Woody Life, April 2023 05.jpg",
          lat: 43.65,
          lng: 142.86,
          caption: {
            en: "The Daisetsuzan group from the west. It holds snow into June.",
            de: "Die Daisetsuzan-Gruppe von Westen. Sie hält den Schnee bis in den Juni.",
          },
        },
      ],
      ask: {
        kind: "quiz",
        question: {
          en: "Japan tracks the autumn colour front moving across the country. Which way does it travel?",
          de: "Japan verfolgt die Herbstfärbungsfront quer durchs Land. In welche Richtung wandert sie?",
        },
        options: {
          en: ["North to south, and downhill", "South to north, like the cherry blossom", "Coast to interior", "It arrives everywhere at once"],
          de: ["Von Nord nach Süd, und bergab", "Von Süd nach Nord, wie die Kirschblüte", "Von der Küste ins Landesinnere", "Sie kommt überall gleichzeitig"],
        },
        correctIndex: 0,
        explanation: {
          en: "The *kōyō* front is the cherry-blossom front in reverse: it starts on Hokkaidō's high ground in September and works south and downhill, reaching Kyūshū's lowlands in December.",
          de: "Die *Kōyō*-Front ist die Kirschblütenfront rückwärts: Sie beginnt im September in Hokkaidōs Höhenlagen und arbeitet sich nach Süden und bergab, bis sie im Dezember Kyūshūs Tiefland erreicht.",
        },
      },
      comments: [
        { author: "Kenji", days: 2, body: { en: "If the ridge is iced, the Sugatami loop is the right call. People underestimate that mountain constantly.", de: "Wenn der Grat vereist ist, ist die Sugatami-Runde die richtige Wahl. Der Berg wird ständig unterschätzt." } },
        { author: "Nina", days: 7, body: { en: "Outdoor onsen in falling snow is the single best argument for October.", de: "Onsen im Freien bei fallendem Schnee ist das beste Argument für Oktober." } },
      ],
    },
    {
      slug: "abashiri-okhotsk-coast",
      date: "2024-10-16",
      place: "Abashiri, Okhotsk",
      lat: 44.0206,
      lng: 144.2736,
      title: { en: "The Sea That Freezes", de: "Das Meer, das gefriert" },
      excerpt: {
        en: "In February the drift ice arrives from Siberia. In October it is a very ordinary grey sea keeping a secret.",
        de: "Im Februar kommt das Treibeis aus Sibirien. Im Oktober ist es ein sehr gewöhnliches graues Meer mit einem Geheimnis.",
      },
      body: {
        en: `Abashiri is famous for two things: a former maximum-security prison, and the fact that its sea freezes.

Every February the Sea of Okhotsk delivers drift ice down from the Amur river mouth, and icebreaker tourism happens. In October it is a perfectly ordinary grey sea with gulls on it, giving nothing away.

The prison museum is genuinely excellent and much sadder than the brochure suggests. Men were sent here in the 1890s to build the road we drove in on. A lot of them did not leave.

[photo:1]

Then east along the coast, past the lagoons, with the Shiretoko peninsula slowly resolving out of the haze ahead like a rumour.`,
        de: `Abashiri ist für zwei Dinge berühmt: ein ehemaliges Hochsicherheitsgefängnis und die Tatsache, dass sein Meer gefriert.

Jeden Februar liefert das Ochotskische Meer Treibeis von der Amur-Mündung herunter, und es gibt Eisbrecher-Tourismus. Im Oktober ist es ein völlig gewöhnliches graues Meer mit Möwen darauf, das nichts verrät.

Das Gefängnismuseum ist wirklich hervorragend und viel trauriger, als der Prospekt vermuten lässt. In den 1890ern wurden Männer hierher geschickt, um die Straße zu bauen, auf der wir angereist sind. Viele von ihnen kamen nicht wieder weg.

[photo:1]

Dann nach Osten die Küste entlang, an den Lagunen vorbei, während sich vorn die Shiretoko-Halbinsel langsam aus dem Dunst schält wie ein Gerücht.`,
      },
      route: {
        profile: "car",
        name: { en: "Sōunkyō → Abashiri → Utoro", de: "Sōunkyō → Abashiri → Utoro" },
        waypoints: [
          [143.04, 43.72],
          [144.2736, 44.0206],
          [144.6000, 44.1200],
          [144.9861, 44.0733],
        ],
      },
      photos: [
        {
          file: "Notoro misaki light house.jpg",
          lat: 44.1069,
          lng: 144.1719,
          caption: {
            en: "Cape Notoro, west of town. The Okhotsk coast keeping quiet about February.",
            de: "Kap Notoro, westlich der Stadt. Die Ochotsk-Küste, die über den Februar schweigt.",
          },
        },
        {
          file: "130713 Abashiri Prison Museum Abashiri Hokkaido Japan08n.jpg",
          lat: 43.9814,
          lng: 144.2181,
          caption: {
            en: "The prison museum. Men sent here in the 1890s built the road we came in on.",
            de: "Das Gefängnismuseum. Männer, die man in den 1890ern hierher schickte, bauten die Straße, auf der wir kamen.",
          },
        },
      ],
      comments: [
        { author: "Yuki", days: 4, body: { en: "Come back in February for the icebreaker. Completely different planet, same town.", de: "Kommt im Februar für den Eisbrecher wieder. Völlig anderer Planet, dieselbe Stadt." } },
      ],
    },
    {
      slug: "shiretoko-end-of-the-earth",
      date: "2024-10-19",
      place: "Rausu, Shiretoko",
      lat: 44.0225,
      lng: 145.1928,
      title: { en: "Shiretoko — 'The End of the Earth'", de: "Shiretoko — „das Ende der Erde“" },
      excerpt: {
        en: "The Ainu named it, the road gives up halfway along it, and the bears outnumber the people.",
        de: "Die Ainu haben es benannt, die Straße gibt auf halbem Weg auf, und die Bären sind in der Überzahl.",
      },
      body: {
        en: `*Sir etok* — Ainu for "the place where the earth ends". Nobody has improved on that name.

The peninsula runs 65 kilometres into the sea towards the Kurils and the road covers less than half of it. After that it's brown bear country: the highest density in Japan, well over two hundred on the peninsula, and the national park signage does not soften this at all.

We did the Five Lakes on the elevated boardwalk, which exists precisely so that you and the bears can ignore each other. Saw one at maybe three hundred metres, doing something unhurried in the grass. Everybody went very quiet and very still, and then very talkative afterwards.

[photo:1]

Over the Shiretoko Pass to Rausu in the late afternoon with Kunashiri lying out there across the strait — close enough to see the weather on it.

[photo:2]

Fourteen days. We stayed ahead of the snow the whole way, and it caught the pass two days after we crossed it.`,
        de: `*Sir etok* — Ainu für „der Ort, an dem die Erde endet“. Niemand hat diesen Namen je verbessert.

Die Halbinsel läuft 65 Kilometer ins Meer Richtung Kurilen, und die Straße schafft weniger als die Hälfte. Danach ist Braunbärenland: die höchste Dichte Japans, weit über zweihundert auf der Halbinsel, und die Beschilderung des Nationalparks beschönigt das kein bisschen.

Wir liefen die Fünf Seen auf dem erhöhten Steg, den es genau dafür gibt, dass man und die Bären einander ignorieren können. Einen gesehen, auf vielleicht dreihundert Meter, wie er ohne Eile etwas im Gras tat. Alle wurden sehr leise und sehr still — und danach sehr gesprächig.

[photo:1]

Am späten Nachmittag über den Shiretoko-Pass nach Rausu, mit Kunaschir da draußen über der Meerenge — nah genug, um sein Wetter zu sehen.

[photo:2]

Vierzehn Tage. Wir sind dem Schnee die ganze Zeit vorausgeblieben, und er erwischte den Pass zwei Tage nach unserer Überfahrt.`,
      },
      route: {
        profile: "car",
        name: { en: "Utoro → Shiretoko Pass → Rausu", de: "Utoro → Shiretoko-Pass → Rausu" },
        waypoints: [
          [144.9861, 44.0733],
          [145.1000, 44.0500],
          [145.1928, 44.0225],
        ],
      },
      photos: [
        {
          search: "Shiretoko Five Lakes",
          lat: 44.1136,
          lng: 145.0906,
          caption: {
            en: "Shiretoko Goko. Rausu-dake behind, already white.",
            de: "Shiretoko Goko. Dahinter der Rausu-dake, schon weiß.",
          },
        },
        {
          search: "Shiretoko Pass Hokkaido",
          lat: 44.05,
          lng: 145.1,
          caption: {
            en: "The Shiretoko Pass. It closed for the winter nine days later.",
            de: "Der Shiretoko-Pass. Neun Tage später schloss er für den Winter.",
          },
        },
      ],
      comments: [
        { author: "Kenji", days: 1, body: { en: "Three hundred metres is a good distance. Two hundred is where it stops being a nice story.", de: "Dreihundert Meter sind ein guter Abstand. Bei zweihundert hört es auf, eine nette Geschichte zu sein." } },
        { author: "Nina", days: 5, body: { en: "Have followed this whole trip. The pass photo is my new desktop.", de: "Habe die ganze Reise verfolgt. Das Passfoto ist mein neuer Desktop." } },
      ],
    },
  ],
};
