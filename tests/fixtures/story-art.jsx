import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import StoryScene from '../../src/components/StoryScene.jsx';
import { STORY_SCENES } from '../../src/data/storyScenes.js';
import { getStoryPortrait } from '../../src/data/storyArt.js';
import { getWorldScene } from '../../src/data/worldArt.js';
import { stages } from '../../src/data/stages.js';
import '../../src/index.css';
import '../../src/journey-ui.css';
import '../../src/player-experience.css';

const root = createRoot(document.getElementById('root'));
window.renderStoryArt = ({ stageId = 3, type = 'intro', index = 1 } = {}) => {
  const scene = { stage: stages.find(stage => stage.id === stageId), type, index, lines: STORY_SCENES[stageId][type], onComplete: 'battle' };
  const show = next => window.renderStoryArt({ stageId, type, index: next });
  flushSync(() => root.render(<div className="app world-art-app"><StoryScene scene={scene}
    background={getWorldScene(stageId)} portrait={getStoryPortrait(scene.lines[index].speaker)}
    onNext={() => show(Math.min(scene.lines.length - 1, index + 1))}
    onPrevious={() => show(Math.max(0, index - 1))} onSkip={() => {}} /></div>));
};
window.renderStoryArt();
