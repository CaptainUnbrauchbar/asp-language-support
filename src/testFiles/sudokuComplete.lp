subgrid_size(3).

v(1..N*N) :- subgrid_size(N).                           % v: all possible values for x,y,z

1{initial(X,Y,Z) : v(Z)}1 :- v(X), v(Y).                % get all stable sudoku models with exactly 1 value z for each possible field x,y

:- initial(A,B,C), initial(X,Y,Z), A=X, B!=Y, C=Z.                  % exclude all answers with duplicate z values per row X
:- initial(A,B,C), initial(X,Y,Z), A!=X, B=Y, C=Z.                  % exclude all answers with duplicate z values per column Y
:- initial(A,B,C), initial(X,Y,Z), B!=Y, A!=X, C=Z,                 % exclude all answers with duplicate z per subgrid N,
((A-1)/N)*N + (B-1)/N == ((X-1)/N)*N+(Y-1)/N, subgrid_size(N).      % (compare subgrids)

sudoku(X,Y,Z) :- initial(X,Y,Z).                                    % show output correctly as sudoku

#show sudoku/3.

initial(2,3,3).
initial(3,3,8).
initial(4,3,1).
initial(5,3,4).
initial(6,3,6).
initial(7,3,5).
initial(8,3,9).
initial(9,3,2).
initial(1,4,5).
initial(2,4,7).
initial(3,4,2).
initial(4,4,8).
initial(5,4,1).
initial(6,4,3).
initial(7,4,9).
initial(8,4,6).
initial(9,4,4).
initial(1,5,4).
initial(2,5,1).
initial(3,5,3).
initial(4,5,9).
initial(5,5,6).
initial(6,5,2).
initial(7,5,7).
initial(8,5,5).
initial(9,5,8).
initial(1,6,9).
initial(2,6,8).
initial(3,6,6).
initial(4,6,5).
initial(5,6,7).
initial(6,6,4).
initial(7,6,2).
initial(8,6,1).
initial(9,6,3).
initial(1,7,2).
initial(2,7,5).
initial(3,7,1).
initial(4,7,6).
initial(5,7,3).
initial(6,7,8).
initial(7,7,4).
initial(8,7,7).
initial(9,7,9).
initial(1,8,8).
initial(2,8,6).
initial(3,8,4).
initial(4,8,2).
initial(5,8,9).
initial(6,8,7).
initial(7,8,1).
initial(8,8,3).
initial(9,8,5).
initial(1,9,3).
initial(2,9,9).
initial(3,9,7).
initial(4,9,4).
initial(5,9,5).
initial(6,9,1).
initial(7,9,8).
initial(8,9,2).