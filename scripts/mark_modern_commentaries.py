# -*- coding: utf-8 -*-

from sefaria.model import Index, Term

titles = {

	# TODO Hebrew Names

	#"Redeeming Relevance",
	"Abraham Cohen Footnotes to the English Translation of Masechet Berakhot": ("Abraham Cohen", "אAbraham Cohen"),
	"Daf Shevui to Ketubot": ("Daf Shevui", "אDaf Shevui"),
	"Daf Shevui to Megillah": ("Daf Shevui", "אDaf Shevui"),
	"Footnotes to Kohelet by Bruce Heitler": ("Bruce Heitler", "אBruce Heitler"),
	"Daf Shevui to Sukkah": ("Daf Shevui", "אDaf Shevui"),
	"Redeeming Relevance; Exodus": ("Francis Nataf", "אFrancis Nataf"),
	"Redeeming Relevance; Numbers": ("Francis Nataf", "אFrancis Nataf"),
	#"Care of the Critically Ill", ),
	"Daf Shevui to Avodah Zarah": ("Daf Shevui", "אDaf Shevui"),
	"Redeeming Relevance; Deuteronomy":  ("Francis Nataf", "אFrancis Nataf"),
	#"Kol HaTor", ),
	"A New Israeli Commentary on Pirkei Avot": ("Avigdor Shinan", "אAvigdor Shinan"),
	"Redeeming Relevance; Genesis": ("Francis Nataf", "אFrancis Nataf"),
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