import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import FieldBattleScene from '../../src/components/FieldBattleScene.jsx';
import { fieldProps } from '../../scripts/field-fixture.mjs';

const root = createRoot(document.getElementById('root'));
window.renderFieldFixture = props => flushSync(() => root.render(props ? <FieldBattleScene {...props} /> : null));
const params = new URLSearchParams(location.search);
window.renderFieldFixture(fieldProps(params.get('unit') || 'hero', params.get('skill'), { duration: 10000 }));
