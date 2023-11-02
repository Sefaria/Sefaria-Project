import pytest
from sefaria.model.linker.named_entity_resolver import NamedEntityTitleGenerator, PersonTitleGenerator


@pytest.mark.parametrize(('title', 'expected_output'), [
    ['Rabbi b. Ben', ['Rabbi b. Ben', 'Rabbi ben Ben', 'Rabbi bar Ben', 'Rabbi, son of Ben', 'Rabbi, the son of Ben',
                      'Rabbi son of Ben', 'Rabbi the son of Ben', 'Rabbi Bar Ben', 'Rabbi Ben Ben', 'R. b. Ben']],
    ['Rabbi ben Ben', ['R. ben Ben', 'Rabbi ben Ben']],
    ['Bar Kochba', ['Bar Kochba', 'bar Kochba']],
])
def test_person_title_generator(title, expected_output):
    expected_output = sorted(expected_output)
    actual_output = sorted(PersonTitleGenerator.generate(title))
    assert actual_output == expected_output
