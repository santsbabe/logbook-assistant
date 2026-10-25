#!/usr/bin/env python3
"""Generate a reproducible Shopping Radar Shortcut. No private voucher codes are embedded."""
from pathlib import Path
import plistlib, uuid

ROOT=Path(__file__).resolve().parent
URL='https://santsbabe.github.io/logbook-assistant/familyroy-control-centre/?shop=pep-home'
def uid(): return str(uuid.uuid4()).upper()
def action(identifier,params):
    return {'WFWorkflowActionIdentifier':identifier,'WFWorkflowActionParameters':{'UUID':uid(),**params}}
def token(s):
    return {'Value':{'string':s,'attachmentsByRange':{}},'WFSerializationType':'WFTextTokenString'}
notification=action('is.workflow.actions.notification',{'WFNotificationActionTitle':token('Shopping Radar · PEP Home'),'WFNotificationActionBody':token('You are near PEP Home. Open your filtered shopping list to check what is still waiting.'),'WFNotificationActionSound':False})
speechtext=action('is.workflow.actions.gettext',{'WFTextActionText':'You are near PEP Home. Shopping Radar is opening your shopping list.'})
speak=action('is.workflow.actions.speaktext',{'WFInput':{'Value':{'OutputUUID':speechtext['WFWorkflowActionParameters']['UUID'],'Type':'ActionOutput','OutputName':'Text'},'WFSerializationType':'WFTextTokenAttachment'}})
url=action('is.workflow.actions.url',{'WFURLActionURL':URL})
openu=action('is.workflow.actions.openurl',{'WFInput':{'Value':{'OutputUUID':url['WFWorkflowActionParameters']['UUID'],'Type':'ActionOutput','OutputName':'URL'},'WFSerializationType':'WFTextTokenAttachment'}})
workflow={'WFWorkflowName':'Shopping Radar – PEP Home','WFWorkflowMinimumClientVersion':900,'WFWorkflowMinimumClientVersionString':'900','WFWorkflowClientVersion':'2607.1.3','WFWorkflowClientRelease':'2607.1.3','WFWorkflowIcon':{'WFWorkflowIconStartColor':4282601983,'WFWorkflowIconGlyphNumber':59511},'WFWorkflowTypes':['NCWidget'],'WFWorkflowInputContentItemClasses':['WFStringContentItem','WFGenericFileContentItem'],'WFWorkflowActions':[notification,speechtext,speak,url,openu]}
out=ROOT/'Shopping Radar - PEP Home.unsigned.shortcut'
with out.open('wb') as f: plistlib.dump(workflow,f,fmt=plistlib.FMT_BINARY)
assert plistlib.loads(out.read_bytes())==workflow
print('Built',len(workflow['WFWorkflowActions']),'actions,',out.stat().st_size,'bytes')
