import json
from typing import NewType, Union
import strawberry


JSONScalar = strawberry.scalar(
    NewType("JSONScalar", Union[dict, list]),
    serialize=lambda x: x,
    parse_value=lambda x: json.loads(x),
    description="Generic json representation to support sending recursive data"
)
