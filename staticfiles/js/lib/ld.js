function Minimum(a, b, c) {
	var mi;
	mi = a;
	if (b < mi)
		mi = b;
	if (c < mi)
		mi = c;
	return mi;
}

function LD(s, t) {
	var d = new Array();
	var n; // length of s
	var m; // length of t
	var i; // iterates through s
	var j; // iterates through t
	var s_i; // ith character of s
	var t_j; // jth character of t
	var cost; // cost


	// Step 1
	n = s.length;
	m = t.length;
	if (n == 0) {
		return m;
	}

	if (m == 0) {
		return n;
	}
	
	//inicjacja tablicy dwu-wymiarowej w Javascript	
	for(i=0; i<=n; i++)
		d[i] = new Array();


	// Step 2
	for (i = 0; i <= n; i++) {
		d[i][0] = i;
	}

	for (j = 0; j <= m; j++) {
		d[0][j] = j;
	}

	// Step 3
	for (i = 1; i <= n; i++) {

		s_i = s.charAt(i - 1);

		
		// Step 4
		for (j = 1; j <= m; j++) {

			t_j = t.charAt(j - 1);

			// Step 5
			if (s_i == t_j) {
				cost = 0;
			}
			else {
				cost = 1;
			}

			// Step 6
			d[i][j] = Minimum (d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1] + cost);
		}

	}
	
	//przepisanie do tablicy globalnej
	for(i=1; i<=n; i++) {
		dG[i] = new Array();
		for(j=1; j<=m; j++)
			dG[i][j] = d[i][j];
	}

	// Step 7
	return d[n][m];
}