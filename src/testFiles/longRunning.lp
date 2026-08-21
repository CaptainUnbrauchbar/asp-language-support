% A deliberately expensive program used to test that a running solve can be
% aborted. Enumerating every solution of 26-queens takes far longer than any
% test should wait, so a run over this file only ends when it is cancelled.
#const n = 26.
p(1..n).
1 { q(X,Y) : p(Y) } 1 :- p(X).
:- q(X1,Y), q(X2,Y), X1 < X2.
:- q(X1,Y1), q(X2,Y2), X1 < X2, Y2 - Y1 == X2 - X1.
:- q(X1,Y1), q(X2,Y2), X1 < X2, Y1 - Y2 == X2 - X1.
