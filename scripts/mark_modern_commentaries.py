# -*- coding: utf-8 -*-

from sefaria.model import Index, Term

titles = {

	# TODO Hebrew Names

	#"Redeeming Relevance",
	"Abraham Cohen Footnotes to the English Translation of Masechet Berakhot": ("Abraham Cohen", u"אברהם כהן"),
	"Daf Shevui to Ketubot": ("Daf Shevui", u"דף שבועי"),
	"Daf Shevui to Megillah": ("Daf Shevui", u"דף שבועי"),
	"Footnotes to Kohelet by Bruce Heitler": ("Bruce Heitler", u"אBruce Heitler"),
	"Daf Shevui to Sukkah": ("Daf Shevui", u"דף שבועי"),
	#"Redeeming Relevance; Exodus": ("Francis Nataf", u"אFrancis Nataf"),
	#"Redeeming Relevance; Numbers": ("Francis Nataf", u"אFrancis Nataf"),
	#"Care of the Critically Ill", ),
	"Daf Shevui to Avodah Zarah": ("Daf Shevui", u"דף שבועי"),
	#"Redeeming Relevance; Deuteronomy":  ("Francis Nataf", u"אFrancis Nataf"),
	#"Kol HaTor", ),
	"A New Israeli Commentary on Pirkei Avot": ("Avigdor Shinan", u"אביגדור שנאן"),
	#"Redeeming Relevance; Genesis": ("Francis Nataf", u"אFrancis Nataf"),
}

for (title, names) in titles.iteritems():
	term = Term().load({"name": names[0]})
	if not term:
		print "adding term for " + names[0]
		term = Term()
		term.name = names[0]
		term.add_primary_titles(names[0], names[1]) 
		term.save()

	i = Index().load({"title": title})
	i.dependence = "Commentary"
	i.collective_title = names[0]
	i.save()
	print "Index updated for " + title