/**
 * jQuery Date Range
 *
 * Helps users select standard ranges of dates like: year, quarter, month,
 * two-week, week and custom.
 *
 * For sake of simplicity however, all ranges are calculated from January 1st
 * of each year.
 *
 *
 * Basic usage:
 *
 * $('.daterange').daterange();
 *
 * Whatever block you match (here, one with class "daterange"), it must
 * contain two input[type=date] which will be recycled into the new widget.
 * Everything else in that block will be lost.
 *
 * Optionally, some configuration options can be specified to override
 * defaults, shown in this example:
 *
 * $('select.autocomplete').autocomplete({
 *   arrowsSubmit: false,  // Set true to submit the form on each arrow click
 *   lang: 'fr',
 *   initRange: 4,  // Default to monthly
 *   previous: false,  // Set true to prefer previous period instead of current
 *   ranges: [ '+1d', '+7d', '+14d', '+0.5m', '+1m', '+2m', '+3m', '+6m', '+1y', '+0' ]
 * });
 *
 * If you enable arrowsSubmit, whatever block has class "daterange" should be
 * given an attribute "data-select" with the contents of the __daterange CGI
 * variable if found.  This allows our widget to override initRange with the
 * last selected rule when the same form is re-displayed without saving state
 * information client-side (which could interfere with other uses of the
 * widget).
 *
 *
 * Advanced usage:
 *
 * If you DO need client-side state manipulation, to have Daterange report its
 * status use the 'getState' event's return value, which can then later be fed
 * back to its 'setState' event handler, which expects CGI input/select names
 * as properties of the passed sole argument object, containing the desired
 * values.  Daterange will only consider the properties it knows about AND IT
 * WILL REMOVE THEM FROM THE OBJECT.  This helps various widgets coexist.
 *
 * CAUTION: This is NOT the same as jQuery's serializeArray() which returns an
 * array of objects containing "name" and "value" properties.  Here we have a
 * single object used more compactly.
 *
 * The 'setState' handler returns TRUE if anything has changed, FALSE
 * otherwise.
 *
 * Example:
 *
 * console.log($('#myDaterange').triggerHandler('getState'));
 * // Object {__daterange: "+1m", from: "2014-06-01", to: "2014-06-30"}
 *
 * // Note jQuery's mandatory [] around our object.
 * // This is required for triggerHandler(), which we need, but not for trigger().
 * // See: http://api.jquery.com/triggerHandler/#triggerHandler-eventType-extraParameters
 * $('#myDaterange').triggerHandler('setState', [{
 *   __daterange: '+2m',
 *   to: '2014-03-03',
 *   foo: 1,
 *   from: '2014-01-01'
 * }]);
 *
 *
 * Adding new languages (or overriding existing ones) is done by extending the
 * plugin's locale, where each rule and month get a displayable name, a
 * long-form date format is specified and a few labels are defined.  For
 * example:
 *
 * $.extend($.fn.daterange.locales, {
 *   en: {
 *     rules: {
 *       '+1d':   'Daily',
 *       '+7d':   'Weekly',
 *       '+14d':  'Bi-weekly',
 *       '+0.5m': 'Semi-monthly',
 *       '+1m':   'Monthly',
 *       '+2m':   'Bi-monthly',
 *       '+3m':   'Quarterly',
 *       '+6m':   'Semi-yearly',
 *       '+1y':   'Yearly',
 *       '+0':    'Other...'
 *     },
 *     Month: [
 *       'Jan',
 *       'Feb',
 *       'Mar',
 *       'Apr',
 *       'May',
 *       'Jun',
 *       'Jul',
 *       'Aug',
 *       'Sep',
 *       'Oct',
 *       'Nov',
 *       'Dec'
 *     ],
 *     format: [ 'LocaleMonth', ' ', 'Date', ', ', 'FullYear' ],
 *     init: 'Choose dates...',
 *     submit: 'Apply'
 *   }
 * });
 *
 * Each element in the format is processed as one of 3 possibilities:
 *
 * 1. A string which is used as-is (i.e. ' ' above)
 *
 * 2. A method available in Date.prototype with the 'get' prefix (i.e. 'Date'
 *    above)
 *
 * 3. A method like in 2 above, but prefixed with 'Locale' to indicate it
 *    should be translated in the current language instead of displayed
 *    directly. (This is why the locale key for months is called 'Month'.)
 *
 *
 * @package   jquery.daterange
 * @author    Stéphane Lavergne <http://www.imars.com/>
 * @copyright 2013 Stéphane Lavergne
 * @license   http://www.gnu.org/licenses/lgpl-3.0.txt  GNU LGPL version 3
 */

/*jslint node: false, browser: true, es5: false, white: true, nomen: true, plusplus: true */
/*global jQuery: true */

(function ($) {
	"use strict";

	$.fn.daterange = function (args) {
		var
			locales = $.fn.daterange.locales,  // This will exist by the time it's invoked.
			ranges = [ '+1d', '+7d', '+14d', '+0.5m', '+1m', '+2m', '+3m', '+6m', '+1y', '+0' ],
			lang = 'en',
			initRange = 4,
			previous = false,
			arrowsSubmit = false
		;
		if (args) {
			if (args.lang)          { lang          = args.lang;          }
			if (args.ranges)        { ranges        = args.ranges;        }
			if (args.initRange)     { initRange     = args.initRange;     }
			if (args.previous)      { previous      = args.previous;      }
			if (args.arrowsSubmit)  { arrowsSubmit  = args.arrowsSubmit;  }
		}
		return this.each(function () {
			var
				outer      = $(this),
				dataSelect = outer.attr('data-select'),
				from       = null,
				to         = null,
				inner      = $('<div>'),
				select     = $('<select>'),
				dateline   = $('<strong>'),
				inputs     = $('<span>'),
				label      = $('<span>'),
				goUp       = $('<button>'),
				goDown     = $('<button>'),
				navBar     = $('<div>'),
				submit     = $('<button>'),
				i          = 0,
				iMax       = 0,
				startObj   = new Date(),
				startVal   = ''
			;

			// Produce an inverse rule to go backwards.
			function invertRule(rule) {
				var newRule = rule;
				if (newRule.charAt(0) === '+') { newRule = '-'+newRule.substring(1); } else { newRule = '+'+newRule.substring(1); }
				return newRule;
			}

			// Convert a ISO8601-ish YYYY-MM-DD into a Date instance at noon.
			// (input.valueAsDate is too modern for our target browsers)
			function toDate(value) {
				var
					d   = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value),
					obj = null
				;
				if (d) {
					obj = new Date(d[1], d[2]-1, d[3], 12);
				}
				return obj;
			}

			// Inverse of toDate().
			function dateToVal(date) {
				var
					day = date.getDate(),
					month = date.getMonth() + 1
				;
				if (day   < 10) { day   = "0"+day; }
				if (month < 10) { month = "0"+month; }
				return date.getFullYear() + '-' + month + '-' + day;
			}

			function sprintDate(format, date) {
				var
					result = '',
					i = 0,
					iMax = 0,
					f = ''
				;

				iMax = format.length;
				for (i=0; i < iMax; i++) {
					if (format[i].search(/^Locale/) >= 0) {
						f = format[i].substring(6);
						if (Date.prototype['get'+f] && locales[lang][f]) {
							result += locales[lang][f][ date['get'+f]() ];
						}
					} else if (Date.prototype['get'+format[i]]) {
						result += date['get'+format[i]]();
					} else {
						result += format[i];
					}
				}

				return result;
			}

			// Modify a date according to offset specification
			function dateOffset(date, offset) {
				var
					rule       = /^([+\-])(\d+)(\.\d+)?([dmy])$/.exec(offset),
					sign       = (rule ? rule[1] : null),  // FIXME: Do we need this?
					unit       = (rule ? rule[4] : null),
					sizeFloat  = (rule ? parseFloat(rule[1]+rule[2]+(rule[3] || '')) : 0),
					sizeInt    = (rule ? parseInt(rule[1]+rule[2], 10) : 0),
					sizeDec    = (rule && rule[3] ? parseFloat(rule[3]) : 0),
					single     = (rule ? parseInt(rule[1]+'1', 10) : 0),
					msDay      = 24 * 3600 * 1000,
					msec       = null,
					tmp        = null,
					year       = null,
					sizeMonths = null,
					month      = null
				;

				if (unit === 'd') {
					date.setTime(date.getTime() + (msDay * sizeFloat));
				} else if (unit === 'm') {
					// Browsers seem to tolerate setMonth(-237) but the day of the
					// month would differ that way.  It is better to overflow
					// ourselves.
					//
					// Note that "February 30th" would still yield "March 2nd" so
					// this is only truly safe for days 1-28.
					year       = date.getFullYear();
					sizeMonths = sizeInt % 12;
					month      = date.getMonth() + sizeMonths;

					// INTEGER SECTION

					// Get multiples of 12 out of the way...
					year += (sizeInt - sizeMonths)/12;

					// Overflow manually, knowing we're % 12.
					if (month < 0) {
						year--;
						month += 12;
					} else if (month > 11) {
						year++;
						month -= 12;
					}

					// Save intermediate
					date.setFullYear(year);
					date.setMonth(month);

					// DECIMAL SECTION

					if (sizeDec !== 0) {
						msec = date.getTime();
						tmp  = new Date(msec);
						month += single;
						if (month < 0) {
							year--;
							month += 12;
						} else if (month > 11) {
							year++;
							month -= 12;
						}
						tmp.setMonth(month);
						tmp.setFullYear(year);
						date.setTime(msec + ((tmp.getTime() - msec) * sizeDec));

						// Cheat to "snap" around 1st of the month
						if (date.getDate() <= 2) { date.setDate(1); }
					}
				} else if (unit === 'y') {
					if (sizeInt !== 0) {
						date.setFullYear(date.getFullYear() + sizeInt);
					}
					if (sizeDec !== 0) {
						msec = date.getTime();
						tmp  = new Date(msec);
						tmp.setFullYear(tmp.getFullYear() + single);
						date.setTime(msec + ((tmp.getTime() - msec) * sizeDec));
					}
				}

				date.setHours(12);
				date.setMinutes(0);
				date.setSeconds(0);
				date.setMilliseconds(0);
				return date;
			}

			// Beginning of range we fit in according to rule.
			function startOfRange(now, rule) {
				var
					tmp = new Date(),
					date = 1,
					backRule = invertRule(rule)
				;
				tmp.setMonth(0);
				tmp.setDate(date);
				tmp.setHours(12);
				tmp.setMinutes(0);
				tmp.setSeconds(0);
				tmp.setMilliseconds(0);
				// If we want weeks, start year on a Sunday.
				if (rule === '+7d'  ||  rule === '+14d') {
					while (tmp.getDay() !== 0) {
						date++;
						tmp.setDate(date);
					}
				}
				while (tmp <= now) {
					tmp = dateOffset(tmp, rule);
				}
				// We couldn't avoid looping once too far
				tmp = dateOffset(tmp, backRule);
				return tmp;
			}

			submit.attr('type', 'submit').text(locales[lang].submit);

			outer.find('input[type=date]').each(function () {
				if (from === null)    { from = $(this).detach(); }
				else if (to === null) { to   = $(this).detach(); }
			});
			from.on('change', function () { to.prop(  'min', $(this).val()); });
			to.on('change',  function ()  { from.prop('max', $(this).val()); });

			// Stamp our widget for others to see
			outer.addClass('__widget __widget_form');
			select.addClass('__widget_field');
			from.addClass('__widget_field');
			to.addClass('__widget_field');
			submit.addClass('__widget_field');

			// Allow form to override today's date
			if (from.val()) {
				startObj = toDate(from.val());
			}
			startObj.setHours(12);
			startObj.setMinutes(0);
			startObj.setSeconds(0);
			startObj.setMilliseconds(0);
			startObj = startOfRange(startObj, ranges[initRange]);
			if (previous) {
				startObj = dateOffset(startObj, invertRule(ranges[initRange]));
			}
			startVal = dateToVal(startObj);
			from.val(startVal);
			to.prop('min', startVal);

			navBar
				.css({
					'display': 'inline-block',
					'margin-right': '2px'
				})
				.append(
					goUp  .css('width', '2em').html('&#9650;'),
					'<br />',
					goDown.css('width', '2em').html('&#9660;')
				);
			navBar.find('button').css({
				'margin': '0',
				'border-width': '1px',
				'background': '#f8f8f8',
				'padding': '0',
				'font-size': '10pt'
			});
			outer
				.css({
					'display': 'inline-block',
					'border': '1px solid #cccccc',
					'border-radius': '2px',
					'padding': '2px',
					'background-color': '#f8f8f8',
					'font-family': 'Arial, Helvetica, sans-serif',
					'font-size': '12pt'
				})
				.find('*').css('font-family', 'Arial, Helvetica, sans-serif');
			inner
				.css({
					'display': 'inline-block'
				})
				.append(select, '<br />', dateline.append(inputs.append(from, '-', to).hide(), label));
			inputs.css({
				'white-space': 'nowrap'
			});
			select.attr('name', '__daterange').css({
				'background': '#f8f8f8',
				'border': 'none',
				'margin': '0',
				'color': '#444444',
				'font-size': '10pt'
			});

			// Browser sniffing is frowned upon in favor of feature detection in
			// JavaScript, but this is specifically a CSS issue.
			if (navigator.userAgent.search(/MSIE [67]/) >= 0) {
				outer.css({ 'display': 'inline', 'zoom': '1' });
				navBar.css({ 'display': 'inline', 'zoom': '1' });
				inner.css({ 'display': 'inline', 'zoom': '1' });
			}

			function updateTo() {
				var
					rule = outer.prop('__rule'),
					fv = from.val(),
					tmp
				;
				to.prop('min', fv);
				if (rule !== '+0') {
					if (fv) {
						tmp = dateOffset(toDate(from.val()), rule);
						tmp.setTime(tmp.getTime() - (24 * 3600 * 1000));
						tmp = dateToVal(tmp);
						to.val(tmp);
						from.prop('max', tmp);
					} else {
						to.val(fv);
						from.prop('max', fv);
					}
				}
			}

			function updateLabel() {
				var
					fromSrc = from.val(),
					toSrc   = to.val(),
					text    = ''
				;
				if (outer.prop('__rule') === '+0') {
					inputs.show();
					label.hide();
				} else if (fromSrc) {
					if (fromSrc !== toSrc) {
						text = sprintDate(locales[lang].format, toDate(fromSrc)) + ' - ';
					}
					text += sprintDate(locales[lang].format, toDate(toSrc));
				} else {
					// Inputs aren't initialized, offer to start messing with it
					// instead of doing so outright, tarnishing the form with the
					// configured initial dates.
					select.hide();
					text = $('<button>');
					text
						.text(locales[lang].init)
						.click(function (ev) {
							select.show();
							if (outer.prop('__rule') !== '+0') { outer.prepend(navBar); }
							if (arrowsSubmit) { outer.append(submit); }
							updateTo();
							updateLabel();
							return arrowsSubmit;
						})
					;
				}
				label.html(text);
			}

			iMax = ranges.length;
			for (i=0; i < iMax; i++) {
				if ((dataSelect && ranges[i] === dataSelect) || (!dataSelect && i === initRange)) {
					outer.prop('__rule', ranges[i]);
					select.append('<option value="'+ranges[i]+'" selected="selected">'+locales[lang].rules[ranges[i]]+'</option>');
				} else {
					select.append('<option value="'+ranges[i]+'">'+locales[lang].rules[ranges[i]]+'</option>');
				}
			}
			select.change(function (ev) {
				var
					newRule = $(this).find('option').filter(':selected').attr('value'),
					oldRule = outer.prop('__rule'),
					tmp
				;
				outer.prop('__rule', newRule);
				if (newRule !== oldRule) {
					// We have a bona fide change
					if (newRule !== '+0') {
						submit.detach();
					}
					if (oldRule === '+0') {
						if (from.val()) {
							outer.prepend(navBar);
						}
						inputs.hide();
						label.show();
					} else if (newRule === '+0') {
						outer.find(navBar).detach();
						outer.append(submit);
						label.hide();
						inputs.show();
					}
					if (oldRule !== '+0' && newRule !== '+0') {
						tmp = startOfRange(toDate(from.val()), newRule);
						if (previous) {
							tmp = dateOffset(tmp, invertRule(newRule));
						}
						from.val(dateToVal(tmp));
					}
					if (newRule !== '+0') {
						updateTo();
					}
				}
				updateLabel();
				if (newRule !== '+0' && arrowsSubmit) {
					$(this).closest('form').trigger('submit');
				}
			});
			goUp.click(function (ev) {
				from.val(dateToVal(dateOffset(toDate(from.val()), outer.prop('__rule'))));
				updateTo();
				updateLabel();
				submit.detach();
				return arrowsSubmit;
			});
			goDown.click(function (ev) {
				var rule = invertRule(outer.prop('__rule'));
				from.val(dateToVal(dateOffset(toDate(from.val()), rule)));
				updateTo();
				updateLabel();
				submit.detach();
				return arrowsSubmit;
			});
			submit.click(function (ev) {
				$(this).closest('form').trigger('submit');
				$(this).detach();
				return false;
			});

			outer.on('setState', function (ev, data) {
				var
					selectName = select.attr('name'),
					fromName = from.attr('name'),
					toName = to.attr('name'),
					oldRule = outer.prop('__rule'),
					changed = false
				;
				if (data[selectName] !== undefined) {
					if (oldRule !== data[selectName]) {
						select.val(data[selectName]);
						select.change();
						changed = true;
					}
					delete data[selectName];
				}
				if (data[fromName] !== undefined) {
					if (data[fromName] !== from.val()) {
						from.val(data[fromName]);
						to.prop('min', data[fromName]);
						changed = true;
					}
					delete data[fromName];
				}
				if (data[toName] !== undefined) {
					if (data[toName] !== to.val()) {
						to.val(data[toName]);
						from.prop('max', data[toName]);
						changed = true;
					}
					delete data[toName];
				}
				updateLabel();
				submit.detach();
				return changed;
			});
			outer.on('getState', function (ev, data) {
				var
					sa = $(this).find('select[value!=""], input[value!=""]').serializeArray(),
					out = {}
				;
				$.each(sa, function (i, field) {
					out[field.name] = field.value;
				});
				return out;
			});

			outer.empty().append(inner);
			if (outer.prop('__rule') === '+0') {
				outer.append(submit);
			} else {
				if (from.val()) {
					outer.prepend(navBar);
				}
			}

			updateTo();
			updateLabel();
			if (arrowsSubmit) { submit.detach(); outer.append(submit); }

		});
	};

	$.fn.daterange.locales = {
		en: {
			rules: {
				'+1d':   'Daily',
				'+7d':   'Weekly',
				'+14d':  'Bi-weekly',
				'+0.5m': 'Semi-monthly',
				'+1m':   'Monthly',
				'+2m':   'Bi-monthly',
				'+3m':   'Quarterly',
				'+6m':   'Semi-yearly',
				'+1y':   'Yearly',
				'+0':    'Other...'
			},
			Month: [
				'Jan',
				'Feb',
				'Mar',
				'Apr',
				'May',
				'Jun',
				'Jul',
				'Aug',
				'Sep',
				'Oct',
				'Nov',
				'Dec'
			],
			format: [ 'LocaleMonth', ' ', 'Date', ', ', 'FullYear' ],
			init: 'Choose dates...',
			submit: 'Apply'
		},
		fr: {
			rules: {
				'+1d':   'Quotidien',
				'+7d':   'Hebdomadaire',
				'+14d':  'Deux semaines',
				'+0.5m': 'Bimensuel',
				'+1m':   'Mensuel',
				'+2m':   'Bimestriel',
				'+3m':   'Trimestriel',
				'+6m':   'Semestriel',
				'+1y':   'Annuel',
				'+0':    'Autre...'
			},
			Month: [
				'Jan',
				'F&eacute;v',
				'Mars',
				'Avr',
				'Mai',
				'Juin',
				'Juil',
				'Ao&ucirc;t',
				'Sept',
				'Oct',
				'Nov',
				'D&eacute;c'
			],
			format: [ 'Date', ' ', 'LocaleMonth', ' ', 'FullYear' ],
			init: 'Choisir dates...',
			submit: 'Appliquer'
		}
	};

}( jQuery ));

