% A program with far more answer sets than any test could enumerate: every
% subset of 25 atoms is a solution, so there are 2^25 of them. Models start
% arriving immediately, which makes this a reliable way to check that a search
% stopped early still reports whatever it had already found.
{ p(1..25) }.
