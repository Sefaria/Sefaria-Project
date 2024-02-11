"""
Celery tasks for the LLM server
"""
from celery import shared_task
from sefaria.helper.llm.topic_prompt import save_topic_prompt_output
from sefaria.helper.llm.llm_interface import TopicPromptGenerationOutput


@shared_task
def save_topic_prompts(raw_output: TopicPromptGenerationOutput):
    output = TopicPromptGenerationOutput.create(raw_output)
    save_topic_prompt_output(output)
