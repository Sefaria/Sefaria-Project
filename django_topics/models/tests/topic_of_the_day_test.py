import pytest
from datetime import date
from django_topics.models import TopicOfTheDay, Topic


@pytest.fixture
def topic(db):
    """Fixture to create a Topic instance."""
    return Topic.objects.create(slug="test-topic")


@pytest.fixture
def topics_of_the_day(db, topic):
    """Fixture to create TopicOfTheDay instances."""
    topics = [
        TopicOfTheDay.objects.create(topic=topic, start_date=date(2024, 11, 26), lang="en"),
        TopicOfTheDay.objects.create(topic=topic, start_date=date(2024, 11, 25), lang="en"),
        TopicOfTheDay.objects.create(topic=topic, start_date=date(2024, 11, 24), lang="en"),
    ]
    return topics


@pytest.mark.django_db
def test_get_topic_of_the_day_with_exact_date_db(topics_of_the_day):
    """Test for exact match."""
    result = TopicOfTheDay.objects.get_topic_of_the_day(lang="en", date=date(2024, 11, 26))

    assert result.start_date == date(2024, 11, 26)
    assert result.lang == "en"


@pytest.mark.django_db
def test_get_topic_of_the_day_with_closest_date_db(topics_of_the_day):
    """Test for the closest date less than or equal to the given date."""
    result = TopicOfTheDay.objects.get_topic_of_the_day(lang="en", date=date(2024, 11, 27))

    assert result.start_date == date(2024, 11, 26)
    assert result.lang == "en"


@pytest.mark.django_db
def test_get_topic_of_the_day_with_no_matching_date_db(db, topic):
    """Test when there is no matching date."""
    TopicOfTheDay.objects.create(topic=topic, start_date=date(2024, 11, 20), lang="en")
    result = TopicOfTheDay.objects.get_topic_of_the_day(lang="en", date=date(2024, 11, 19))

    assert result is None
