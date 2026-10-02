/*
 * h.js — bootstrap único do React + htm. Todo componente importa daqui,
 * para não repetir o bind em cada arquivo e garantir uma só instância do React.
 *
 * Cuidado conhecido do htm: um template com MAIS DE UMA RAIZ vira array, e o
 * React pede `key` em cada item. Quando precisar de várias raízes, embrulhe em
 * <span className="contents"> (display:contents, não afeta o layout).
 */
'use strict';
const React = require('react');
const ReactDOM = require('react-dom');
const html = require('../vendor/htm.js').bind(React.createElement);

module.exports = {
  React,
  ReactDOM,
  html,
  useState: React.useState,
  useEffect: React.useEffect,
  useMemo: React.useMemo,
  useRef: React.useRef,
  useCallback: React.useCallback,
  useReducer: React.useReducer,
};
