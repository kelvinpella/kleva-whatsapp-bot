/**
 * Fallback content results used when the Fal AI workflow fails or returns
 * unparseable output. A random entry is selected for each failed request.
 */

const fallbackResults = [
  {
    title: "Mtindo wa kisasa wa wanawake",
    description:
      "Mtindo mzuri huonekana kupitia uchaguzi wa mavazi na vifaa vinavyoendana na matumizi ya kila siku. Kleva Fashion Mpya Kariakoo huangazia mitindo mbalimbali inayopendwa na wanawake. Nguo za wadada trending Kariakoo, Pochi za wadada trending Kariakoo na Viatu vya wadada trending Kariakoo ni miongoni mwa misemo ambayo watu wengi hutumia kutafuta mitindo mipya kwenye mitandao ya kijamii.",
    on_screen: {
      header: "Mtindo wa kisasa",
      bullets: "Muundo wa kisasa,Rahisi kupangilia,Kwa matumizi mengi",
    },
  },
  {
    title: "Muonekano wa kisasa",
    description:
      "Mitindo ya kisasa huchanganya ubunifu, urahisi na muonekano unaovutia katika matumizi ya kila siku. Kleva Fashion Mpya Kariakoo huleta taarifa kuhusu mitindo inayopendwa na wanawake. Nguo za wadada trending Kariakoo, Pochi za wadada trending Kariakoo na Viatu vya wadada trending Kariakoo ni baadhi ya maneno yanayotafutwa mara nyingi na watumiaji.",
    on_screen: {
      header: "Muonekano mzuri",
      bullets: "Mtindo wa kisasa,Muundo maridadi,Rahisi kuvaliwa",
    },
  },
  {
    title: "Mitindo ya wanawake",
    description:
      "Mitindo ya wanawake hubadilika kulingana na ubunifu wa muundo, rangi na matumizi. Kleva Fashion Mpya Kariakoo hushiriki taarifa kuhusu mitindo mbalimbali ya wanawake. Nguo za wadada trending Kariakoo, Pochi za wadada trending Kariakoo na Viatu vya wadada trending Kariakoo ni misemo maarufu inayosaidia watu kugundua mitindo mipya.",
    on_screen: {
      header: "Mitindo ya leo",
      bullets: "Rangi mbalimbali,Kwa matumizi mengi,Muundo wa kisasa",
    },
  },
  {
    title: "Ubunifu wa kisasa",
    description:
      "Ubunifu wa bidhaa za mitindo hujumuisha muundo, mwonekano na matumizi yanayofaa kwa mazingira mbalimbali. Kleva Fashion Mpya Kariakoo huonyesha mitindo inayovutia wanawake wengi. Nguo za wadada trending Kariakoo, Pochi za wadada trending Kariakoo na Viatu vya wadada trending Kariakoo ni maneno yanayotumika mara kwa mara katika utafutaji wa mitindo.",
    on_screen: {
      header: "Ubunifu wa leo",
      bullets: "Muundo wa kisasa,Rangi maridadi,Kwa kila siku",
    },
  },
  {
    title: "Mwonekano unaovutia",
    description:
      "Mwonekano mzuri hujengwa kwa kuchagua bidhaa zinazokamilisha mtindo wa kuvaa katika mazingira tofauti. Kleva Fashion Mpya Kariakoo huangazia mitindo mbalimbali ya wanawake. Nguo za wadada trending Kariakoo, Pochi za wadada trending Kariakoo na Viatu vya wadada trending Kariakoo ni miongoni mwa misemo inayotafutwa mara nyingi na watumiaji wa mitandao ya kijamii.",
    on_screen: {
      header: "Mwonekano bora",
      bullets: "Muundo wa kisasa,Rahisi kuoanisha,Kwa kila tukio",
    },
  },
];

/**
 * Pick a random fallback result.
 * @returns {Object} Fallback result with title, description, and on_screen fields.
 */
function getRandomFallbackResult() {
  const index = Math.floor(Math.random() * fallbackResults.length);
  return fallbackResults[index];
}

module.exports = { fallbackResults, getRandomFallbackResult };
