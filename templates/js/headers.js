{% load sefaria_tags static%}

<script src="{% static 'js/lib/keyboard.js' %}"></script>
<script type="text/javascript">
{% autoescape off %}
	var sjs = sjs || {};

	$.extend(sjs, {
		_email:             "{{ request.user.email|default:'null' }}",
		_uid:               {{ request.user.id|default:"null" }},
		books:              {{ titlesJSON|default:"[]" }},
        booksDict:          {}, // populated below
        calendar:           {
                                 parasha: "{{ parasha_ref }}",
                                 parashaName: "{{ parasha_name }}",
                                 haftara: "{{ haftara_ref }}",
                                 daf_yomi: "{{ daf_yomi_ref }}"
                            },
		toc:                {{ toc_json|default:"null" }},
		searchBaseUrl:      '{{ SEARCH_URL|default:"http://localhost:9200" }}',
		searchIndex:        '{{ SEARCH_INDEX_NAME }}',
		is_moderator:       {% if user.is_staff %}true{% else %}false{% endif %},
        notificationCount:  {{ notifications_count|default:'0' }},
        notifications:      {{ notifications_json|default:'[]' }},
		help: {
			videos: {
				intro:       "TaUB0jd0dzI",
				navigation:  "OrhpZ82zodI",
				tutorial:    "xXFkweBv7ws",
				sheets:      "iac0GoaH2lY",
				translate:   "rImt5SnNa-8",
				add:         "R4h439Iyk-o",
				edit:        "Go8uJJ9_6ug",
				connections: "Epx-Ou2O_2M",
				newtext:     "gcqsGAP4jfg"
			}
		},
		handleSearch: function() {
			//$(".searchInput").focus();
			var query = $(this).closest(".searchBox").find(".searchInput").val();
			if (query) {
				$(".searchInput").autocomplete("close");
                $(".searchInput").val(query);

				if (isRef(query)) {
					sjs.navQuery(query);
					sjs.track.ui("Nav Query");
				} else {
					if (sjs.currentPage !== 'search') {
						window.location="/search?q=" + query.replace(/ /g, "+");
					} else {
                        sjs.search.query = query;
                        sjs.search.clear_available_filters();
                        sjs.search.post(true, true);
					}
				}
			}
		},
		navQuery: function(query) {
			window.location = "/" + normRef(query) + "?nav_query=" + query;
		},
		searchInsteadOfNav: function (query) {
			// Displays an option under the search box to search for 'query' rather
			// than treat it as a navigational query.
			var html = "<div id='searchInsteadOfNavPrompt'>" +
                            "Search for '<a href='/search?q=" + query + "'>" + query + "</a>' instead." +
						"</div>";
			$("#searchInsteadOfNavPrompt").remove();
			$(html).appendTo("body").css({left: $("#goto").offset().left});
			setTimeout('$("#searchInsteadOfNavPrompt").remove();', 4000);
		}
	});

    // Transform sjs.books array into a dictionary for quick lookup
    for (var i=0; i<sjs.books.length; i++) {
        sjs.booksDict[sjs.books[i]] = 1;
    }

	// Left hand Navigation Menu
	sjs.navPanel = {
		_path: [],
		_sections: [],
		_preview: null,
		_showPreviews: Math.random() < 0.5 ? true : false, // A/B testing initial state
        _structure: "default",
		init: function() {
			if (!sjs.toc) {
				sjs.loadToc(sjs.navPanel.init);
				return;
			}
			$("#navToc").on("click", ".tocCat", this._handleNavClick);
			// Langugage Toggle
			$("#navToc").on("click", ".langToggle", function() {
				var lang = $(this).attr("data-lang");
				$("#navToc").removeClass("english hebrew")
					.addClass(lang);
				$("#navToc .langToggle").removeClass("active");
				$(this).addClass("active");
				sjs.navPanel.setNavContent();
				$.cookie("interfaceLang", lang);
			});
			$("#left").click(function(){
				$("#navPanel").toggleClass("navPanelOpen");
			});
			$("#navPanel, #left").click(function(e) {
				e.stopPropagation();
			});
			$("#aboutSefaria").click(function(e){
				$("#navPanelLinks").hide();
				$("#navPanelAboutLinks").show();
				e.preventDefault();
			});
			$("#aboutLinksBack").click(function(e){
				$("#navPanelLinks").show();
				$("#navPanelAboutLinks").hide();
				e.preventDefault();
			});
			$("#navPanelTexts #moreLink").click(function() {
				$("#navPanelTexts").addClass("expand clickedMore");
			});
			$("#navPanelTexts #lessLink").click(function() {
				$("#navPanelTexts").removeClass("expand clickedMore");
			});
			$("#navToc").on("click", "#navTocPreviewToggle", function() {
				if (sjs.navPanel._showPreviews) {
					sjs.navPanel._showPreviews = false;
					sjs.track.ui("Nav Panel Text Previews off");
				} else {
					sjs.navPanel._showPreviews = true;
					sjs.track.ui("Nav Panel Text Previews on");
				}
				sjs.navPanel.setNavContent();
				sjs.navPanel._saveState();
			});
            $("#navToc").on("change", "#structureDropdown", function() {
                sjs.navPanel._structure = $("#structureDropdown select").val();
                sjs.navPanel._sections = sjs.navPanel._sections.slice(0,1);  //On structure change, go back to the text root
				sjs.navPanel.setNavContent();
				sjs.navPanel._saveState();
            });
			$("#navTocPreviewToggle").tooltipster({
				delay: 400,
				hideOnClick: true,
				position: "bottom"
			});
			$("#navToc").on("click", ".textTocLink", function(e) {
				e.stopPropagation();
			});

			var prevState = $.cookie("navPanelState")
			if (prevState) {
				var state = JSON.parse(prevState);
				this._showPreviews = state.showPreviews;
                this._structure = state.structure;
				if (sjs.current && sjs.current.title && this._path[this._path.length-1] === sjs.current.title) {
					this._path     = state.path;
					this._sections = state.sections;
				}
				if (state.path.length) {
					$("#navPanelTexts").addClass("expand");
				}
			}
			this.setNavContent();
		},
		_handleNavClick: function(e) {
			e.preventDefault();
			var dataPath = $(this).attr("data-path");
			sjs.navPanel._path = dataPath ? dataPath.split("/") : [];
			var dataSections = $(this).attr("data-sections");
			sjs.navPanel._sections = dataSections ? dataSections.split("/") : [];
			sjs.navPanel.setNavContent();
			sjs.navPanel._saveState();
		},
		_saveState: function() {
			$.cookie("navPanelState", JSON.stringify({path:         sjs.navPanel._path,
													  sections:     sjs.navPanel._sections,
													  showPreviews: sjs.navPanel._showPreviews,
                                                      structure:    sjs.navPanel._structure
													}));
		},
		setNavContent: function() {
			var sections = this._sections;
            var nodeTitle = "";
            if (sjs.navPanel._preview && sections[0] == sjs.navPanel._preview.title) {
                nodeTitle = sjs.navPanel._preview.schema.get_node_title_from_indexes(sections.slice(1));
            }
			if (sections.length                                     // We're at the book level or deeper
                && (!sjs.navPanel._preview                          // We don't have a preview yet
                    || sections[0] != sjs.navPanel._preview.title   // The preview is for the wrong title
                    || nodeTitle != sjs.navPanel._preview.node_title // The preview is for the wrong node
                    //|| !sjs.navPanel._preview.preview               // we only need to refresh if we're now at a content node
                )
            ) {
				var url = "/api/preview/" + ((nodeTitle) ? nodeTitle.replace(/ /g, "_") : sections[0]);
				$.getJSON(url, function(data){
					if ("error" in data) {
						sjs.alert.message(data.error)
					} else {
						sjs.navPanel._preview = data;
                        sjs.navPanel._preview.schema = new sjs.SchemaNode(data.schema);
                        sjs.navPanel._structure = sjs.navPanel._preview.default_struct || "default";

						sjs.navPanel.setNavContent();
					}
				});
				return;
			}
			var html = this.makeNavContent();
			$("#navTocPreviewToggle").tooltipster("destroy"); // Prevent buggy tooltip display on second click
			$("#navToc").html(html);
			if (this._path.length === 0 && !$("#navPanelTexts").hasClass("clickedMore") ) {
				$("#navPanelTextsMore").show();
				$("#navPanelTexts").removeClass("expand");
			} else {
				$("#navPanelTexts").addClass("expand");
				$("#navPanelTextsMore").hide();
			}
			if (this._showPreviews) {
				$("#navToc").addClass("showPreviews");
			} else {
				$("#navToc").removeClass("showPreviews");
			}
			$("#navTocPreviewToggle").tooltipster({
				delay: 400,
				hideOnClick: true,
				position: "bottom"
			});
			$(".tooltipster").tooltipster({ position: "bottom" });
			$(".navLine").eq(0).show();
		},
		makeNavContent: function() {
			var path         = this._path;
			var sections     = this._sections;
			var previewDepth = sections.length;  //If schema, set again below
			var basePath     = path.join("/").replace(/\'/g, "&apos;");
			var backPath     = path.slice(0, -1).join("/").replace(/\'/g, "&apos;");
			var backSections = sections.slice(0, -1).join("/").replace(/\'/g, "&apos;");
            var isRoot       = path.length === 0;
            var hasAlts      = sections.length && "alts" in this._preview;
            var altsActive   = hasAlts && this._structure && this._structure != "default";
            var isCategory   = !sections.length;

            if (!isCategory) {
                var schema       = this._preview.schema;
                var schema_node = schema.get_node_from_indexes(sections.slice(1));
                previewDepth = schema.get_preview_depth_from_indexes(sections.slice(1));
                var isStructureNode = !!("nodes" in schema_node);
            }

            //Function to be passed to array.reduce() that descends a schema according to the string keys in the array.
            function schemaWalker(previousValue, currentValue, index, array) {
                if (typeof currentValue == "string") {
                   return previousValue["nodes"][currentValue];
                } else {
                    return previousValue
                }
            }

            if (altsActive) {
                var activeStructure = this._preview.alts[sjs.navPanel._structure];
                var current_node = sections.slice(1).reduce(schemaWalker, activeStructure);
            }
            var html =  "<div id='tocTopMatter'>";

            if (!isRoot) {
                // Back Link
				html += "<div class='tocCat backLink' data-path='" + (sections.length ? basePath : backPath) + "' " +
								"data-sections='" + backSections + "'><i class='fa fa-angle-left'></i> back</div>";
            }

            // Language & Preview Toggles
			html += "<div id='navTocLangToggleBox'>" +
						"<i id='navTocPreviewToggle' class='fa fa-eye' title='Text preview on/off'></i>" +
						"<div id='navTocLangToggle' class='toggle'>" +
						"<div class='langToggle toggleOption " + ($("#navToc").hasClass("english") ? "active" : "") + "' data-lang='english'>" +
							"<img src='{% static 'img/english.png' %}' /></div>" +
						"<div class='langToggle toggleOption " + ($("#navToc").hasClass("hebrew") ? "active" : "") + "' data-lang='hebrew'>" +
							"<img src='{% static 'img/tibetan.png' %}' /></div>" +
						"</div></div>";

            // Structure selector
            if (hasAlts) {
                html += "<div id='structureDropdown'>" +
                    "<span id='browseBy'>Browse by </span>" +
                        "<select>" +
                            "<option value='default' " + ((sjs.navPanel._structure == "default")?"selected ":"") + ">" +
                                (schema_node.sectionNames ? hebrewPlural(schema_node.sectionNames.slice(-2)[0]) : "Primary Structure") +
                            "</option>";
                            for(var n in this._preview.alts) {
                                html += "<option value='" + n + "' " + ((sjs.navPanel._structure == n)?"selected ":"") + ">" + n + "</option>";
                            }
                html += "</select>" +
                    "</div>";
            } else {
                sjs.navPanel._structure = "default";
            }
                            html += '</div>'; //close tocTopMatter


			//  Header - Back Link & Breadcrumbs
			if (isRoot) {
                html += "<div id='tocCatHeaders'><div class='tocCat tocCatHeader'>" +
                        "Browse Texts" +
                    "<div class='clear'></div>" +
                    "</div></div>";
			} else {
				// Breadcumbs
                var default_offset = 0;  // If we pass a default node, offset section names to reflect that.
				var cats = [];
				cats.push("<div class='tocCat tocCatHeader' data-path=''><i class='fa fa-home'></i></div>");
				for (var i = 0; i < path.length; i++) {
					var catPath = path.slice(0, i+1).join("/").replace(/\'/g, "&apos;");
					cats.push("<div class='tocCat tocCatHeader' data-path='" + catPath + "'>" + path[i] + "</div>");
				}
				for (var i = 0; i < sections.length; i++) {
					var sectionPath = sections.slice(0, i+1).join("/").replace(/\'/g, "&apos;");
                    if (altsActive) {
                        var n = sections.slice(1, i+1).reduce(function(previousValue, currentValue, index, array) {
                            return previousValue["nodes"][currentValue];
                        }, activeStructure);
                    }
                    var crumb;
                    if (i == 0) {
                        crumb = sections[i];
                    } else {
                        if (altsActive) {
                            crumb = n["title"]
                        } else if(schema.is_node_from_indexes(sections.slice(1, i+1))) {
                            var snode = schema.get_node_from_indexes(sections.slice(1, i+1));
                            if (snode.default) {  // Defaults don't get breadcrumbs
                                default_offset++;
                                continue;
                            }
                            crumb = snode["title"];
                        } else {
                            crumb = schema_node.sectionNames[i - 1 - default_offset] + " " + sections[i]
                        }
                    }

					cats.push("<div class='tocCat tocCatHeader' data-path='" + catPath + "'" +
								"data-sections='" + sectionPath + "'>" + crumb + "</div>");
				}

				html += "<div id='tocCatHeaders'>" +
								cats.join(" &raquo; ") +
								"<div class='clear'></div>" +
							"</div>";

			}

			// List Content - Categories, Texts, Sections or Section Previews
			if (isCategory) {
				// Categories & Texts
				var node = this.getTocNode(path);
				for (var i=0; i < node.length; i++) {
					var catPath = basePath ? (node[i].category ? basePath + "/" + node[i].category : basePath ) : node[i].category;
					catPath = catPath.replace(/\'/g, "&apos;");

					if ("title" in node[i]) {
						// Text
						html += "<div class='tocCat' " +
									 "data-path='" + catPath + "'" +
									 "data-sections='" + node[i].title.replace(/\'/g, "&apos;") +"'>" +
									 	"<i class='tocCatCaret fa fa-angle-" +
									 		($("#navToc").hasClass("hebrew") ? "left" : "right") +
									 	"'></i>" +
									 	"<a class='textTocLink tooltipster' href='/" + node[i].title.replace(/\'/g, "&apos;") + "' title='Table of Contents'><i class='fa fa-list-ul'></i></a>" +
									 	"<span class='en'>" + node[i].title + "</span>" +
									 	"<span class='he'>" + node[i].heTitle + "</span>" +
								"</div>";
					} else {
						// Category
						html += "<div class='tocCat' data-path='" + catPath + "'>" +
									"<i class='tocCatCaret fa fa-angle-" +
										($("#navToc").hasClass("hebrew") ? "left" : "right") +
									"'></i>" +
									"<span class='en'>" + node[i].category + "</span>" +
									"<span class='he'>" + node[i].heCategory + "</span>" +
								"</div>"
					}
				}
			} else if (altsActive) {
                if ("nodes" in current_node) {   // Structure - todo: handle default in alts?
                    html += "<div class='sectionName'>" + hebrewPlural(sjs.navPanel._structure) + "</div>";
                    for (var i = 0; i < current_node["nodes"].length; i++) {
                        var nod = current_node["nodes"][i];
                        if (nod.depth == 0) {
                            var ref = nod["wholeRef"];
                            var url = "/" + ref;
                            html += "<a class='tocLink previewLink' href='" + url + "'>" +
                            "<i class='tocCatCaret fa fa-angle-" +
                            ($("#navToc").hasClass("hebrew") ? "left" : "right") +
                            "'></i>" +
                            "<span class='en'>" + nod["title"] + "</span>" +
                            "<span class='he'>" + nod["heTitle"] + "</span>" +
                            "</a>";
                        } else {
                            html += "<div class='tocCat' data-path='" + basePath + "'" +
                            "data-sections='" + sections.join("/").replace(/\'/g, "&apos;") + "/" + i + "'>" +
                            "<i class='tocCatCaret fa fa-angle-" +
                            ($("#navToc").hasClass("hebrew") ? "left" : "right") +
                            "'></i>" +
                            "<span class='en'>" + nod["title"] + "</span>" +
                            "<span class='he'>" + nod["heTitle"] + "</span>" +
                            "</div>";
                        }
                    }
                }
                else if ("refsPreview" in current_node) { // Content - todo: doesn't yet work beyond depth 1

                    var isTalmudAddress = current_node.addressTypes[0] == "Talmud";  // still hacky. reworking the isTalmud logic
                    var offset = current_node.offset || 0;

                    var alt_section_names = current_node["sectionNames"][0];
                    html += "<div class='sectionName'>" + hebrewPlural(alt_section_names) + "</div>";
                    var refs_preview = current_node["refsPreview"];
                    if (!this._showPreviews) {
                        html += "<div id='numLinkBox'>"
                    }
                    for (var i = 1; i <= current_node["refs"].length; i++) {
                        var io = i + offset;
                        var num = isTalmudAddress ? intToDaf(io - 1) : io;
                        var heNum = isTalmudAddress ? encodeHebrewDaf(intToDaf(io - 1)) : encodeHebrewNumeral(io);

                        var ref = current_node["refs"][i - 1];
                        var url = "/" + ref;
                        var he = refs_preview[i - 1].he;
                        var en = refs_preview[i - 1].en;
                        if (!en && !he) {
                            continue;
                        }
                        var klass = (he ? "" : "enOnly") + " " + (en ? "" : "heOnly");

                        if (this._showPreviews) {
                            html += "<a class='tocLink previewLink " + klass + "' href='" + url + "'>" +
                            "<i class='tocCatCaret fa fa-angle-" +
                            ($("#navToc").hasClass("hebrew") ? "left" : "right") +
                            "'></i>" +
                            "<div class='en'><span class='segmentNumber'>" + num + ".</span>" + en + "</div>" +
                            "<div class='he'><span class='segmentNumber'>" + heNum + ".</span>" + he + "</div>" +
                            "</a>";
                        } else {
                            html += "<a class='tocLink numLink " + klass + "' href='" + url + "'>" +
                            "<span class='en'>" + num + "</span>" +
                            "<span class='he'>" + heNum + "</span>" +
                            "</a>";
                        }
                    }
                    if (!this._showPreviews) {
                        html += "</div>"
                    }
                }
            } else if (isStructureNode) {      //Navigating structure
                //html += "<div class='sectionName'>" + hebrewPlural(sjs.navPanel._structure) + "</div>";
                for (var i = 0; i < schema_node["nodes"].length; i++) {
                    var nod = schema_node["nodes"][i];
                    if (nod.default) {
                        html += "<div class='inline-default-node'>" + makeSectionContent.call(this, nod, sections.concat(i)) + "</div>";
                    } else {
                        html += "<div class='tocCat' data-path='" + basePath + "'" +
                        "data-sections='" + sections.join("/").replace(/\'/g, "&apos;") + "/" + i + "'>" +
                        "<i class='tocCatCaret fa fa-angle-" +
                        ($("#navToc").hasClass("hebrew") ? "left" : "right") +
                        "'></i>" +
                        "<span class='en'>" + nod["title"] + "</span>" +
                        "<span class='he'>" + nod["heTitle"] + "</span>" +
                        "</div>";
                    }

                }
            } else {
                html += makeSectionContent.call(this, schema_node, sections);
            }
            function makeSectionContent(node, sects) {
                var html = "";
                // Sections & Section Previews
                var isTalmud = node.addressTypes && node.addressTypes[0] == "Talmud";  //was $.inArray("Talmud", path) >- 1;
                var isCommentary = $.inArray("Commentary", path) > -1;
                var previewSection = this._preview.preview;
                for (var i = 1; i < previewDepth; i++) {
                    var indx = sects.length - previewDepth + i;
                    // Zoom in to the right section of the preview
                    var j = (isTalmud && isCommentary && i === 1) ? dafToInt(sects[1]) : sects[indx] - 1;
                    previewSection = previewSection[j];
                }
                if (previewDepth >= node.sectionNames.length - 1) {
                    // Section Preview (terminal depth, preview text)
                    var isTalmmudAddress = node.addressTypes.slice(-2)[0] == "Talmud";  // still hacky. reworking the isTalmud logic
                    html += "<div class='sectionName'>" + hebrewPlural(node.sectionNames.slice(-2)[0]) + "</div>";
                    if (!this._showPreviews) {
                        html += "<div id='numLinkBox'>"
                    }
                    for (var i = 1; i <= previewSection.length; i++) {
                        var num = isTalmmudAddress ? intToDaf(i - 1) : i;
                        var heNum = isTalmmudAddress ? encodeHebrewDaf(intToDaf(i - 1)) : encodeHebrewNumeral(i);
                        //var url   = ("/" + sects.join(".") + "." + num).replace(/\'/g, "&apos;");
                        var url = "/" + this._preview.schema.get_node_url_from_indexes(sects.slice(1).concat(num));
                        var he = previewSection[i - 1].he;
                        var en = previewSection[i - 1].en;
                        if (!en && !he) {
                            continue;
                        }
                        var klass = (he ? "" : "enOnly") + " " + (en ? "" : "heOnly");

                        if (this._showPreviews) {
                            html += "<a class='tocLink previewLink " + klass + "' href='" + url + "'>" +
                            "<i class='tocCatCaret fa fa-angle-" +
                            ($("#navToc").hasClass("hebrew") ? "left" : "right") +
                            "'></i>" +
                            "<div class='en'><span class='segmentNumber'>" + num + ".</span>" + en + "</div>" +
                            "<div class='he'><span class='segmentNumber'>" + heNum + ".</span>" + he + "</div>" +
                            "</a>";
                        } else {
                            html += "<a class='tocLink numLink " + klass + "' href='" + url + "'>" +
                            "<span class='en'>" + num + "</span>" +
                            "<span class='he'>" + heNum + "</span>" +
                            "</a>";
                        }

                    }
                    if (!previewSection.length) {
                        html += "<br><center><i>No text available.</i></center>";
                    }
                    if (!this._showPreviews) {
                        html += "</div>"
                    }

                } else {
                    // Sections List ("Chapter 1, Chapter 2")
                    for (var i = 0; i < previewSection.length; i++) {
                        var ps = previewSection[i];
                        console.log(ps);
                        if (typeof ps == "object" && ps.en == "" && ps.he == "") {
                            console.log("skip")
                            continue; // Skip sections with no content
                        }
                        var num = isTalmud && isCommentary ? intToDaf(i) : (i + 1);
                        var heNum = isTalmud && isCommentary ? encodeHebrewDaf(intToDaf(i)) : encodeHebrewNumeral(i + 1);
                        html += "<div class='tocCat' data-path='" + basePath + "'" +
                        "data-sections='" + sects.join("/").replace(/\'/g, "&apos;") + "/" + num + "'>" +
                        "<i class='tocCatCaret fa fa-angle-" +
                        ($("#navToc").hasClass("hebrew") ? "left" : "right") +
                        "'></i>" +
                        "<span class='en'>" + node.sectionNames[previewDepth - 1] + " " + num + "</span>" +
                        "<span class='he'>" + node.heSectionNames[previewDepth - 1] + " " + heNum + "</span>" +
                        "</div>";
                    }
                }
                return html;
            }

			return html;
		},
		getTocNode: function(path, toc) {
			toc = toc || sjs.toc;
			if (path.length === 0) {
				return toc;
			}
			for (var i=0; i < toc.length; i++) {
				if (toc[i].category === path[0]) {
					if (path.length == 1) {
						return toc[i].contents;
					} else {
						return this.getTocNode(path.slice(1), toc[i].contents);
					}
				}
			}
			return null;
		}
	};

	$(function() {

		// Search / Open a Text Box
		$(".searchInput").autocomplete({ source: function( request, response ) {
				var matches = $.map( sjs.books, function(tag) {
						if ( tag.toUpperCase().indexOf(request.term.toUpperCase()) === 0 ) {
							return tag;
						}
					});
				response(matches.slice(0, 30)); // limits return to 30 items
			}
		}).keypress(function(e) {
			if (e.keyCode == 13) {
				sjs.handleSearch.apply(this);
			}
		}).focus(function() {
			//$(this).css({"width": "300px"});
			$(this).closest(".searchBox").find(".keyboardInputInitiator").css({"opacity": 1});
		}).blur(function() {
			$(this).closest(".searchBox").find(".keyboardInputInitiator").css({"opacity": 0});
		});
		$(".searchButton").mousedown(sjs.handleSearch);


		// NavPanel
		if ($("#navPanel").length) {
            sjs.navPanel.init();
        }

		// Close menus on outside click
		$(window).click(function(){
			$("#navPanel.navPanelOpen").removeClass("navPanelOpen");
		});

		// Language Toggles
		sjs.changeContentLang = function() {
			var mode = this.id;
			var shortMode = this.id.substring(0,2);
			sjs.langMode = shortMode;
			$.cookie("contentLang", mode);

			$("#languageToggle .toggleOption").removeClass("active");
			$(this).addClass("active");

			$("body, #content").removeClass("english hebrew bilingual")
				.addClass(mode)
                .trigger("languageChange");
			return false;
		};
		$("#hebrew, #english, #bilingual").click(sjs.changeContentLang);


		// Default tooltipster
		if ($().tooltipster) {
            $(".tooltipster").tooltipster();
        }


	    // Notifications - Mark as read
	    $("#notificationsButton").mouseenter(function() {
	    	if ($("#newNotificationsCount").length) {
				sjs.markNotificationsAsRead();
	    	}
	    });
	    sjs.markNotificationsAsRead = function() {
			var ids = []
			$(".notification.unread").each(function() {
				ids.push($(this).attr("data-id"));
			});
			if (ids.length) {
				$.post("/api/notifications/read", {notifications: JSON.stringify(ids)}, function(data) {
					console.log(data)
				});
			}
			var unread = parseInt($("#newNotificationsCount").text()) - ids.length;
			if (unread == 0 ) {
				$("#newNotificationsCount").hide();
			}
			$("#newNotificationsCount").text(unread);

	    };

	    // Notifications - Load more through scrolling
	    sjs.notificationsPage = 1;
	    $('#notifications').bind('scroll', function() {
        	if($(this).scrollTop() + $(this).innerHeight() >= this.scrollHeight) {
         	   sjs.loadMoreStories();
        	}
    	});
    	sjs.loadMoreStories = function() {
    		$.getJSON("/api/notifications?page=" + sjs.notificationsPage, function(data) {
    			if (data.count < data.page_size) {
    				$("#notifications").unbind("scroll");
    			}
				$("#notifications").append(data.html);
				sjs.notificationsPage = data.page + 1;
    			sjs.markNotificationsAsRead();
    		})
    	};


    	// Messages
    	sjs.composeMessage = function(recipient, name) {
    		$("#viewMessage").remove();
    		var composerHTML = "<div id='messageComposer' class='modal'>" +
									"<div id='messageHeader'>Send a message to " + name + "</div>" +
									"<textarea id='messageTextarea'></textarea>" +
									"<div class='sendMessage btn btn-primary'>Send</div>" +
									"<div class='cancel btn'>Cancel</div>" +
								"</div>";

			$(composerHTML).appendTo("body").show()
				.position({of: window})
				.draggable({cancel: "textarea"});
			$("#overlay").show();
			$("#messageTextarea").focus();
			$(".sendMessage").click(function(e){
				sjs.postMessage(recipient, $("#messageTextarea").val());
			});
			$("#messageComposer .cancel").click(function(e){
				$("#messageComposer").remove();
				$("#overlay").hide();
			});
		};
		sjs.postMessage = function(recipient, message) {
			if (!message) { return; }
			var postJSON = JSON.stringify({
				recipient: recipient,
				message: message.escapeHtml()
			});
			$.post("/api/messages", {json: postJSON}, function(data) {
				$("#messageComposer").remove();
				sjs.alert.message("Message Sent");
				sjs.track.event("Messages", "Message Sent", "");
			});
		};
		sjs.viewMessage = function(sender, name, message) {
			var messageHtml = "<div id='viewMessage' class='modal'>" +
									"<div id='messageHeader'>Message from " + name + "</div>" +
									"<div id='messageText'>" + message + "</div>" +
									"<div class='messageReply btn btn-primary' data-recipient='" + sender +"'>Reply</div>" +
									"<div class='cancel btn'>Close</div>" +
								"</div>";
			$(messageHtml).appendTo("body").show()
				.position({of: window})
				.draggable({cancel: "#messageText"});
			$("#overlay").show();
			$("#viewMessage .cancel").click(function(e){
				$("#viewMessage").remove();
				$("#overlay").hide();
			});

		};
		{% if profile %}
		$("#messageMe").click(function() {
			{% if request.user.is_authenticated %}
			sjs.composeMessage({{ profile.id }}, "{{ profile.first_name }} {{profile.last_name }}");
			{% else %}
			sjs.loginPrompt();
			{% endif %}
		});
		{% endif %}
		$("body, #notifications").on("click", ".messageReply", function() {
			var recipient = parseInt($(this).attr("data-recipient"));
			var name      = $(this).parent().find("a.userLink")[0].outerHTML;;
			sjs.composeMessage(recipient, name);
		});
		$("#notifications").on("click", ".messageView", function() {
			var recipient = parseInt($(this).attr("data-recipient"));
			var name      = $(this).parent().find("a.userLink")[0].outerHTML;
			var message   = $(this).parent().find(".messageText").html();
			sjs.viewMessage(recipient, name, message);
		});


		// Share Link / Share Modal
		sjs.showShareModal = function(e){
			$("#shareModal").show().position({of: window});
			$("#overlay").show();
			$("#shareModalInput").val(window.location).select();
	    	sjs.track.event("Share Modal", "Open", "");
			e.stopPropagation();
		};
		$("#shareLink").click(sjs.showShareModal);


		sjs.hideModals = function(e){
			$(".modal").hide();
			$("#overlay").hide();
            $("#textPreview").remove();
            sjs.help.close();
			e.stopPropagation();
		};
		$("#overlay").click(sjs.hideModals);


	    // Help modal - open/close
	    $.extend(sjs.help, {
            open: function(e){
            	var vid = $("#helpVideoButtons .btn-success").attr("id").substring(5);
            	sjs.help.makeVideo(vid);
            	$("#overlay, #helpModal").show().position({of: window, collision: "fit"});
            	if (e) {
            		e.preventDefault();
            		e.stopPropagation();
            	}
            	sjs.track.event("Help", "Open", "");
            },
            openVideo: function(vid) {
                console.log("ov " + vid);
                $("#helpVideoButtons .btn").removeClass("btn-success");
                $("#help-" + vid).addClass("btn-success");
                sjs.help.makeVideo(vid);
                sjs.track.event("Help", "Video", vid);
            },
            makeVideo: function(vid) {
            	var url = "http://www.youtube.com/embed/" +
            					sjs.help.videos[vid] +
            					"?enablejsapi=1&rel=0&autoplay=1";
            	var html = '<iframe id="helpVideo" src="' + url + '" frameborder="0" allowfullscreen></iframe>';
            	$("#helpVideoBox").html(html);
            },
            close: function() {
                $("#overlay, #helpModal").hide();
                $("#helpVideo").remove();
            },
            init: function() {
                $(".helpLink").click(sjs.help.open);
                $("#helpClose").click(sjs.help.close);
                $("#helpVideoButtons .btn").click(function(){
                    var vid = this.id.substring(5); // remove 'help-' from id
                    sjs.help.openVideo(vid);
                });
            }
        });
        sjs.help.init();


		// Move Goto box, controls into hidden menu for small screen size
		sjs.adjustLayout = function() {
			// Layout changes for small screen sizes that can't be accomplised
			// with media-queries only
			var width     = $(window).width();
			var $gotoBox  = $("#gotoBox");
			var $controls = $("#controls");

			// gotoBox into options bar
			if (width >= 500 && $gotoBox.parent().attr("id") === "navPanel") {
				$("#breadcrumbs").before($gotoBox);
                $(".navLine").first().remove();
			} else if (width < 500 && $gotoBox.next().attr("id") === "breadcrumbs") {
				$("#navPanel").prepend('<div class="navLine"></div>');
                $("#navPanel").prepend($gotoBox);
                $gotoBox.show();
			}
	    };
	    $(window).resize(sjs.adjustLayout);
	    sjs.adjustLayout();

	    // Show / Hide Options Bar (for small screen widths)
	    sjs.showOptionsBar = function() {
	    	$("#accountBox").appendTo("#rightButtons");
	    	$("#rightButtons").show();
	    };
	    sjs.hideOptionsBar = function() {
	    	$("#accountBox").prependTo("#rightButtons");
	    	$("#rightButtons").css("display", "");
	    };
	    $("#showOptions").click(function(e){
	    	if ($("#rightButtons").is(":visible")) {
	    		sjs.hideOptionsBar();
	    	} else {
	    		sjs.showOptionsBar();
	    		e.stopPropagation();
	    	}
	    })
	    $("#rightButtons").click(function(e){e.stopPropagation();});
	    $(window).click(sjs.hideOptionsBar);

		// browser check --
		// this attempts to create an element and add css3 text shadow to it to it
		// these are only supported in recent firefox, chrome, safari & ie > 9

		$("#sefaria").css("text-shadow", "2px 2px #ff0000");
		var sefariaSupportedBrowser = !!$("#alertMessage").css("text-shadow");
		$("#sefaria").css("text-shadow", "");

		if (sefariaSupportedBrowser == false) {
		$("#alertMessage").html('<strong>Warning:</strong> Your browser is out of date and unsupported by Sefaria<br/>Please use a more up to date browser or download one <a href="http://browsehappy.com/" target="_blank">here</a>.').show();
		}

	});
{% endautoescape %}



</script>
