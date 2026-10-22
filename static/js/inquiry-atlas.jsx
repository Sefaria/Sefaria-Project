import 'core-js/stable';
import 'regenerator-runtime/runtime';
import React from 'react';
import ReactDOM from 'react-dom';
import LearningActivityAtlas from './inquiry/LearningActivityAtlas';
const config = JSON.parse(document.getElementById('inquiry-atlas-config').textContent);
ReactDOM.render(<LearningActivityAtlas config={config} />, document.getElementById('inquiry-atlas-root'));
