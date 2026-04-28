import pytest

from sefaria.helper.linker.disambiguator import _get_commentary_base_ref


@pytest.mark.parametrize("citing_ref,expected", [
    # --- None / empty inputs ---
    (None, None),
    ("", None),

    # --- Non-commentary: no base_text_titles ---
    ("Genesis 1:1", None),

    # --- Multiple base texts (Ein Ayah covers both Berakhot and Shabbat) ---
    ("Ein Ayah 1:1", None),

    # --- Book-level citing ref: base resolved to book level, too coarse ---
    ("Rashi on Genesis", None),

    # --- Both simple: Torah ---
    ("Rashi on Genesis 1:3:1", "Genesis 1:3"),
    # section-level citing ref still resolves correctly
    ("Rashi on Genesis 1:3", "Genesis 1:3"),

    # --- Both simple: Talmud (Amud addressing) ---
    ("Rashi on Bava Kamma 2a:1:1", "Bava Kamma 2a:1"),
    ("Tosafot on Sukkah 2a:1:1", "Sukkah 2a:1"),

    # --- Both complex, matching node titles: Meir Ayin on Seder Olam Rabbah ---
    # Both indices have 'Introduction' and 'default' children with matching English titles.
    # The default leaf has depth 2 (['Perek', 'Integer']), so section level = 1 number.
    ("Meir Ayin on Seder Olam Rabbah 1:1:1", "Seder Olam Rabbah 1"),
    ("Vilna Gaon on Seder Olam Rabbah 1:1:1", "Seder Olam Rabbah 1"),

    # --- Both complex, node titles match (key != title): Prisha on Tur ---
    # Prisha's internal key is 'OrachChaim' but en title is 'Orach Chayim', which
    # matches Tur's 'Orach Chayim' child. Tur's Orach Chaim leaf has depth 2
    # (['Siman', 'Seif']), so section level = Siman only.
    ("Prisha, Orach Chaim 1:1", "Tur, Orach Chayim 1"),

    # --- Complex citing, simple base (XOR → None) ---
    # Mishnat Eretz Yisrael is complex; Mishnah Shabbat is not.
    ("Mishnat Eretz Yisrael on Mishnah Shabbat, Appendix 3:20", None),

    # --- Simple citing, complex base (XOR → None) ---
    # Chelkat Mechokek is not complex; Shulchan Arukh Even HaEzer is.
    ("Chelkat Mechokek 1:1", None),

    # --- Both complex, citing has no base_text_titles ---
    # Ra'avad on Sifra has an empty base_text_titles list.
    ("Ra'avad on Sifra, Vayikra Dibbura DeNedavah, Chapter 2 1:1", None),
])
def test_get_commentary_base_ref(citing_ref, expected):
    assert _get_commentary_base_ref(citing_ref) == expected
