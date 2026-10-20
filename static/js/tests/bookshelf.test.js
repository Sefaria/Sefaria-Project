/* Testing done using Jest */
// The bookshelf store reads a few things off the Sefaria singleton; give it a minimal one.
jest.mock("../sefaria/sefaria", () => ({
  __esModule: true,
  default: {
    _uid: null,
    bookshelf: [],
    util: { epoch_time: () => 1000 },
    lastPlaceForText: () => undefined,
    editProfileAPI: jest.fn(() => Promise.resolve()),
    index: () => undefined,
  },
}));
import Sefaria from "../sefaria/sefaria";
import Bookshelf from "../sefaria/bookshelf";

const events = [];
Bookshelf.subscribe((type, payload) => events.push({type, payload}));

beforeEach(() => {
  window.localStorage.clear();
  events.length = 0;
  Sefaria._uid = null;
  Sefaria.bookshelf = [];
});

const promos = () => events.filter(e => e.type === "promo").map(e => e.payload);

describe("formatRef", function () {
  it.each([
    ["Genesis 1:7", false, "Genesis 1:7"],
    ["Genesis 1:1-8", false, "Genesis 1:1"],
    ["Berakhot 12b:3", true, "Berakhot 12b"],
    ["Berakhot 12b:3-5", true, "Berakhot 12b"],
    ["Berakhot 12b", true, "Berakhot 12b"],
  ])("formats %s (talmud: %s) as %s", function (ref, isTalmud, expected) {
    expect(Bookshelf.formatRef(ref, isTalmud)).toBe(expected);
  });
});

describe("noteBookOpened", function () {
  it("shows the add promo on the second open, with the animation the first time", function () {
    Bookshelf.noteBookOpened("Genesis");
    expect(promos()).toEqual([]);
    Bookshelf.noteBookOpened("Genesis");
    expect(promos()).toEqual([{book: "Genesis", variant: "add", animate: true}]);
  });

  it("shows the promo once per book, and animates only the first promo ever", function () {
    ["Genesis", "Genesis", "Genesis", "Exodus", "Exodus"].forEach(Bookshelf.noteBookOpened);
    expect(promos()).toEqual([
      {book: "Genesis", variant: "add", animate: true},
      {book: "Exodus", variant: "add", animate: false},
    ]);
  });

  it("skips books already on the shelf", function () {
    Bookshelf.add("Genesis");
    Bookshelf.noteBookOpened("Genesis");
    Bookshelf.noteBookOpened("Genesis");
    expect(promos()).toEqual([]);
  });

  it("shows the sign-up promo to an anonymous reader whose slot is full", function () {
    Bookshelf.add("Genesis");
    Bookshelf.noteBookOpened("Berakhot");
    Bookshelf.noteBookOpened("Berakhot");
    expect(promos()).toEqual([{book: "Berakhot", variant: "signup", animate: false}]);
  });
});

describe("anonymous slot", function () {
  it("holds one book and rejects a second", async function () {
    await Bookshelf.add("Genesis");
    await expect(Bookshelf.add("Berakhot")).rejects.toBe("full");
    expect(Bookshelf.getBooks()).toEqual(["Genesis"]);
  });

  it("frees the slot when the book is removed", async function () {
    await Bookshelf.add("Genesis");
    await Bookshelf.remove("Genesis");
    await Bookshelf.add("Berakhot");
    expect(Bookshelf.getBooks()).toEqual(["Berakhot"]);
  });

  it("tracks where the reader left off in their book", async function () {
    await Bookshelf.add("Genesis");
    Bookshelf.noteHistory({ref: "Genesis 1:7", book: "Genesis"});
    Bookshelf.noteHistory({ref: "Exodus 2:1", book: "Exodus"});
    expect(Bookshelf.lastRef("Genesis")).toBe("Genesis 1:7");
  });

  it("toasts with the source of the add", async function () {
    await Bookshelf.add("Genesis", "promo");
    expect(events.find(e => e.type === "toast").payload).toEqual({book: "Genesis", source: "promo"});
  });
});

describe("mergeAfterLogin", function () {
  it("moves the anonymous and pending books into the account", async function () {
    await Bookshelf.add("Genesis");
    Bookshelf.setPending("Berakhot");
    Sefaria._uid = 1;
    Sefaria.bookshelf = [{book: "Exodus", added: 1}];
    Bookshelf.mergeAfterLogin();
    expect(Bookshelf.getBooks()).toEqual(["Berakhot", "Genesis", "Exodus"]);
    expect(window.localStorage.getItem("bookshelf_anon")).toBeNull();
    expect(window.localStorage.getItem("bookshelf_pending")).toBeNull();
  });
});
