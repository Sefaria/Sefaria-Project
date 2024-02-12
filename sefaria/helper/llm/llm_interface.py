"""
Classes for instantiating objects received from the LLM repo
"""
from typing import List
from dataclasses import dataclass


@dataclass
class TopicPrompt:
    title: str
    prompt: str
    ref: str
    slug: str


@dataclass
class TopicPromptGenerationOutput:
    lang: str
    prompts: List[TopicPrompt]

    @staticmethod
    def create(raw_output):
        return TopicPromptGenerationOutput(
            **{**raw_output, "prompts": [TopicPrompt(**raw_prompt) for raw_prompt in raw_output['prompts']]}
        )

