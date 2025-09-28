# -*- coding: utf-8 -*-
"""
HTMX views for text rendering and infinite scrolling functionality.
"""

import json
from django.shortcuts import render
from django.http import JsonResponse, HttpResponse
from django.template.loader import render_to_string
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from sefaria.model import Ref, library
from sefaria.system.exceptions import InputError, PartialRefInputError
from sefaria.utils.util import text_preview
import sefaria.model as model


def htmx_text_column(request, ref):
    """
    HTMX endpoint for rendering a text column with a given reference.
    Returns initial text content for a reference with infinite scroll setup.
    """
    try:
        oref = Ref(ref)
        # Ref constructor will raise an exception if invalid
        
        # Get language mode from query parameters
        lang_mode = request.GET.get('lang', 'both')  # 'source', 'both', 'translation'
        
        # Get text data for the reference
        text_family = model.TextFamily(oref, commentary=False, context=True, pad=False)
        text_data = text_family.contents()
        
        # Build initial context
        context = {
            'ref': ref,
            'oref': oref,
            'text_data': text_data,
            'lang_mode': lang_mode,
            'has_prev': bool(oref.prev_section_ref()),
            'has_next': bool(oref.next_section_ref()),
        }
        
        # For HTMX requests, return just the content
        if request.META.get('HTTP_HX_REQUEST'):
            return render(request, 'htmx/text_column_content.html', context)
        
        # For regular requests, return full page
        return render(request, 'htmx/text_column.html', context)
        
    except (InputError, PartialRefInputError) as e:
        if request.headers.get('HX-Request'):
            return HttpResponse(f'<div class="error">Error: {str(e)}</div>', status=400)
        return render(request, 'htmx/text_column.html', {'error': str(e)})


@csrf_exempt
@require_http_methods(["GET"])
def htmx_load_previous_sections(request, ref):
    """
    HTMX endpoint for loading previous sections in infinite scroll.
    Returns HTML content to be prepended to the text column.
    """
    try:
        oref = Ref(ref)
        prev_refs = []
        current_ref = oref
        
        # Get language mode from query parameters
        lang_mode = request.GET.get('lang', 'both')
        
        # Load up to 10 previous sections
        for i in range(10):
            prev_ref = current_ref.prev_section_ref()
            if not prev_ref:
                break
            prev_refs.insert(0, prev_ref)
            current_ref = prev_ref
            
        if not prev_refs:
            return HttpResponse('<div class="no-more-content">No previous content</div>')
            
        # Render each previous section
        sections_html = []
        for prev_ref in prev_refs:
            text_family = model.TextFamily(prev_ref, commentary=False, context=True, pad=False)
            text_data = text_family.contents()
            section_context = {
                'ref': prev_ref.normal(),
                'oref': prev_ref,
                'text_data': text_data,
                'lang_mode': lang_mode,
            }
            section_html = render_to_string('htmx/text_range.html', section_context)
            sections_html.append(section_html)
            
        return HttpResponse(''.join(sections_html))
        
    except Exception as e:
        return HttpResponse(f'<div class="error">Error loading previous: {str(e)}</div>', status=400)


@csrf_exempt  
@require_http_methods(["GET"])
def htmx_load_next_sections(request, ref):
    """
    HTMX endpoint for loading next sections in infinite scroll.
    Returns HTML content to be appended to the text column.
    """
    try:
        oref = Ref(ref)
        next_refs = []
        current_ref = oref
        
        # Get language mode from query parameters
        lang_mode = request.GET.get('lang', 'both')
        
        # Load up to 10 next sections
        for i in range(10):
            next_ref = current_ref.next_section_ref()
            if not next_ref:
                break
            next_refs.append(next_ref)
            current_ref = next_ref
            
        if not next_refs:
            return HttpResponse('<div class="no-more-content">No more content</div>')
            
        # Render each next section
        sections_html = []
        for next_ref in next_refs:
            text_family = model.TextFamily(next_ref, commentary=False, context=True, pad=False)
            text_data = text_family.contents()
            section_context = {
                'ref': next_ref.normal(),
                'oref': next_ref,
                'text_data': text_data,
                'lang_mode': lang_mode,
            }
            section_html = render_to_string('htmx/text_range.html', section_context)
            sections_html.append(section_html)
            
        return HttpResponse(''.join(sections_html))
        
    except Exception as e:
        return HttpResponse(f'<div class="error">Error loading next: {str(e)}</div>', status=400)


def htmx_text_range(request, ref):
    """
    HTMX endpoint for rendering a single text range.
    Used for individual section loading.
    """
    try:
        oref = Ref(ref)
        text_family = model.TextFamily(oref, commentary=False, context=True, pad=False)
        text_data = text_family.contents()
        
        # Get language mode from query parameters
        lang_mode = request.GET.get('lang', 'both')
        
        context = {
            'ref': ref,
            'oref': oref,
            'text_data': text_data,
            'lang_mode': lang_mode,
        }
        
        return render(request, 'htmx/text_range.html', context)
        
    except Exception as e:
        return HttpResponse(f'<div class="error">Error: {str(e)}</div>', status=400)