const puppeteer = require("puppeteer");
const cheerio = require("cheerio");
const axios = require("axios");

// OrthoCal API
exports.fetchcalendarAPI = (req, res) => {
  const { year, month, day, jurisdiction } = req.body;
  const apiURL = "https://orthocal.info";
  const url = `${apiURL}/api/${jurisdiction}/${
    year ? `${year}/${month ? `${month}/${day ? `${day}/` : ""}` : ""}` : ""
  }`;

  axios
    .get(url)
    .then((info) => {
      const calendarAPI =
        typeof info.data === "object" && typeof info.data.length !== "number"
          ? { ...info.data }
          : [...info.data];

      if (
        typeof calendarAPI.length !== "number" &&
        typeof calendarAPI.fast_level === "number"
      ) {
        if (calendarAPI.fast_level === 0) {
          calendarAPI.fast_exception_desc = "Fast Free";
        } else if (calendarAPI.fast_level > 0) {
          if (!calendarAPI.fast_exception_desc.replace(" ", "")) {
            calendarAPI.fast_exception_desc = "Strict Fast";
          } else if (
            calendarAPI.fast_exception_desc.toLowerCase() === "no overrides"
          ) {
            calendarAPI.fast_exception_desc = "Strict Fast";
          }
        }
      }
      res.json({ calendarAPI });
    })
    .catch((err) => console.error(err));
};

// OCA Saint Lives
exports.fetchOCASaints = async (req, res) => {
  const { year, month, day } = req.body;

  const url = `https://www.oca.org/saints/lives/${
    year && month && day ? `${year}/${month}/${day}/` : ""
  }`;

  puppeteer
    .launch()
    .then((browser) =>
      browser
        .newPage()
        .then((page) =>
          page
            .goto(url)
            .then(() => page.waitForSelector("article.saint"))
            .then(() => page.content())
            .catch((err) => console.error(err))
        )
        .then((html) => {
          const saints = [];
          const $ = cheerio.load(html);

          $("article.saint").each(function () {
            saints.push({
              title: $(this).find("h2").text(),
              image: $(this).find("img").attr("src") || "",
              link: "https://oca.org" + $(this).find("a").attr("href"),
            });
          });

          res.json({ saints });
          browser.close();
        })
        .catch((err) => console.error(err))
    )
    .catch((err) => console.error(err));
};

// ROC Info
exports.fetchROCInfo = async (req, res) => {
  const { year, month, day } = req.body;
  const url = `https://www.holytrinityorthodox.com/calendar/calendar.php?dt=0&header=1&lives=5&trp=0&scripture=0${
    year && month && day
      ? `&year=${parseInt(year)}&month=${parseInt(month)}&today=${parseInt(
          day
        )}`
      : ""
  }`;

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    const navigate = await page.goto(url);
    const selector = await page.waitForSelector("body");
    const html = await selector.content();

    let $ = cheerio.load(html);
    const feastDay = [];
    const links = [];

    $("span.headerheader").each(function () {
      $(this).find("span.headerfast").remove();
      if ($(this).text().includes(":")) {
        feastDay.push(
          $("span.headerheader").text().split(":")[1].split(".")[0].trim()
        );
      }
    });

    $(".normaltext a").each(function () {
      if (links.includes($(this).attr("href")) === false) {
        links.push($(this).attr("href"));
      }
    });

    const promise = await Promise.all(
      links.map(async (link) => {
        const newPage = await page.goto(link);
        const selectBody = await newPage.waitForSelector("tbody");
        const saintsHTML = newPage.content();

        return saintsHTML;
        console.log(saintsHTML);
      })
    );

    $ = cheerio.load(saintsHTML);
    let saints;

    $("tbody").each(function () {
      let image = link;
      if ($(this).find("img").attr("src")) {
        let remove = "";
        for (let i = link.length - 1; i > -1; i--) {
          if (link[i] !== "/") {
            remove += link[i];
          } else {
            remove = remove.split("").reverse().join("");

            i = -1;
          }
        }

        image = image.replace(remove, $(this).find("img").attr("src"));
      } else {
        image = "";
      }

      saints = {
        title: $(this).find("p.header12").text(),
        image,
        link,
      };
    });

    // console.log(saints);
    res.json({ saints, feastDay });
    browser.close();
  } catch {
    (err) => console.error(err);
  }
};

// ROC Fast (Merge with other ROC controller)
exports.fetchROCFast = (req, res) => {
  const { year, month, day } = req.body;

  const url = `https://www.holytrinityorthodox.com/calendar/calendar.php?dt=0&header=1&lives=0&trp=0&scripture=0${
    year && month && day
      ? `&year=${parseInt(year)}&month=${parseInt(month)}&today=${parseInt(
          day
        )}`
      : ""
  }`;

  axios
    .get(url)
    .then((info) => {
      const fast = {
        fastDesc: info.data,
        allowed: "",
        disallowed: "",
        symbol: "",
      };

      const $ = cheerio.load(fast.fastDesc);

      if ($(".headerfast").text().trim()) {
        fast.fastDesc = $(".headerfast").text();
      } else if ($(".headernofast").text().trim()) {
        fast.fastDesc = $(".headernofast").text();
      } else {
        fast.fastDesc = "Fast Free";
      }

      if (fast.fastDesc) {
        fast.fastDesc = fast.fastDesc.replace(/<[^>]+>/g, "");

        if (fast.fastDesc.includes("Full abstention from food")) {
          fast.disallowed = "All food";

          fast.symbol = "emojione-monotone:fork-and-knife";
        } else if (fast.fastDesc.includes("Strict Fast")) {
          fast.allowed = "Raw vegetables, fruit and bread";
          fast.disallowed =
            "Cooked food, meat, fish, oil, wine, dairy and eggs";

          fast.symbol = "mdi:bolnisi-cross";
        } else if (fast.fastDesc.includes("Food without Oil")) {
          fast.allowed = "Cooked vegetables, fruit, legumes and bread";
          fast.disallowed =
            "Fried foods, meat, fish, oil, wine, dairy and eggs";

          fast.symbol = "emojione:pot-of-food";
        } else if (fast.fastDesc.includes("Food with Oil")) {
          fast.allowed = "All of DRY FAST, wine and oil";
          fast.disallowed = "Meat, fish, dairy and eggs";

          fast.symbol = "noto:grapes";
        } else if (fast.fastDesc.includes("Caviar Allowed")) {
          fast.allowed = "All of DRY FAST, wine, oil and caviar";
          fast.disallowed = "Meat, fish, dairy and eggs";

          fast.symbol = "emojione:letter-c";
        } else if (fast.fastDesc.includes("Fish Allowed")) {
          fast.allowed = "All of DRY FAST, wine, oil, caviar and fish";
          fast.disallowed = "Meat, dairy and eggs";

          fast.symbol = "noto:fish";
        } else if (fast.fastDesc.includes("Meat is excluded")) {
          fast.allowed = "All of DRY FAST, wine, oil, fish, eggs and dairy";
          fast.disallowed = "Meat";

          fast.symbol = "noto:cheese-wedge";
        }
      }
      res.json({ fast });
    })
    .catch((err) => console.error(err));
};
