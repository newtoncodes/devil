WebInspector.EditFileSystemDialog=function(fileSystemPath)
{WebInspector.DialogDelegate.call(this);this._fileSystemPath=fileSystemPath;this.element=document.createElementWithClass("div","dialog-contents");var header=this.element.createChild("div","header");var headerText=header.createChild("span");headerText.textContent=WebInspector.UIString("Edit file system");var closeButton=header.createChild("div","close-button-gray done-button");closeButton.addEventListener("click",this._onDoneClick.bind(this),false);var contents=this.element.createChild("div","contents");WebInspector.isolatedFileSystemManager.mapping().addEventListener(WebInspector.FileSystemMapping.Events.FileMappingAdded,this._fileMappingAdded,this);WebInspector.isolatedFileSystemManager.mapping().addEventListener(WebInspector.FileSystemMapping.Events.FileMappingRemoved,this._fileMappingRemoved,this);WebInspector.isolatedFileSystemManager.mapping().addEventListener(WebInspector.FileSystemMapping.Events.ExcludedFolderAdded,this._excludedFolderAdded,this);WebInspector.isolatedFileSystemManager.mapping().addEventListener(WebInspector.FileSystemMapping.Events.ExcludedFolderRemoved,this._excludedFolderRemoved,this);var blockHeader=contents.createChild("div","block-header");blockHeader.textContent=WebInspector.UIString("Mappings");this._fileMappingsSection=contents.createChild("div","section");this._fileMappingsListContainer=this._fileMappingsSection.createChild("div","settings-list-container");var entries=WebInspector.isolatedFileSystemManager.mapping().mappingEntries(this._fileSystemPath);var urlColumn={id:"url",placeholder:WebInspector.UIString("URL prefix")};var pathColumn={id:"path",placeholder:WebInspector.UIString("Folder path")};this._fileMappingsList=new WebInspector.EditableSettingsList([urlColumn,pathColumn],this._fileMappingValuesProvider.bind(this),this._fileMappingValidate.bind(this),this._fileMappingEdit.bind(this));this._fileMappingsList.addEventListener(WebInspector.SettingsList.Events.Removed,this._fileMappingRemovedfromList.bind(this));this._fileMappingsList.element.classList.add("file-mappings-list");this._fileMappingsListContainer.appendChild(this._fileMappingsList.element);this._entries={};for(var i=0;i<entries.length;++i)
this._addMappingRow(entries[i]);blockHeader=contents.createChild("div","block-header");blockHeader.textContent=WebInspector.UIString("Excluded folders");this._excludedFolderListSection=contents.createChild("div","section excluded-folders-section");this._excludedFolderListContainer=this._excludedFolderListSection.createChild("div","settings-list-container");var excludedFolderEntries=WebInspector.isolatedFileSystemManager.mapping().excludedFolders(fileSystemPath);this._excludedFolderList=new WebInspector.EditableSettingsList([pathColumn],this._excludedFolderValueProvider.bind(this),this._excludedFolderValidate.bind(this),this._excludedFolderEdit.bind(this));this._excludedFolderList.addEventListener(WebInspector.SettingsList.Events.Removed,this._excludedFolderRemovedfromList.bind(this));this._excludedFolderList.element.classList.add("excluded-folders-list");this._excludedFolderListContainer.appendChild(this._excludedFolderList.element);this._excludedFolderEntries=new StringMap();for(var i=0;i<excludedFolderEntries.length;++i)
this._addExcludedFolderRow(excludedFolderEntries[i]);this.element.tabIndex=0;this._hasMappingChanges=false;}
WebInspector.EditFileSystemDialog.show=function(element,fileSystemPath)
{WebInspector.Dialog.show(element,new WebInspector.EditFileSystemDialog(fileSystemPath));var glassPane=document.getElementById("glass-pane");glassPane.classList.add("settings-glass-pane");}
WebInspector.EditFileSystemDialog.prototype={show:function(element)
{this._dialogElement=element;element.appendChild(this.element);element.classList.add("settings-dialog","settings-tab");},_resize:function()
{if(!this._dialogElement||!this._relativeToElement)
return;const minWidth=200;const minHeight=150;var maxHeight=this._relativeToElement.offsetHeight-10;maxHeight=Math.max(minHeight,maxHeight);var maxWidth=Math.min(540,this._relativeToElement.offsetWidth-10);maxWidth=Math.max(minWidth,maxWidth);this._dialogElement.style.maxHeight=maxHeight+"px";this._dialogElement.style.width=maxWidth+"px";WebInspector.DialogDelegate.prototype.position(this._dialogElement,this._relativeToElement);},position:function(element,relativeToElement)
{this._relativeToElement=relativeToElement;this._resize();},willHide:function(event)
{if(!this._hasMappingChanges)
return;if(window.confirm(WebInspector.UIString("It is recommended to restart DevTools after making these changes. Would you like to restart it?")))
WebInspector.reload();},_fileMappingAdded:function(event)
{var entry=(event.data);this._addMappingRow(entry);},_fileMappingRemoved:function(event)
{var entry=(event.data);if(this._fileSystemPath!==entry.fileSystemPath)
return;delete this._entries[entry.urlPrefix];if(this._fileMappingsList.itemForId(entry.urlPrefix))
this._fileMappingsList.removeItem(entry.urlPrefix);this._resize();},_fileMappingValuesProvider:function(itemId,columnId)
{if(!itemId)
return"";var entry=this._entries[itemId];switch(columnId){case"url":return entry.urlPrefix;case"path":return entry.pathPrefix;default:console.assert("Should not be reached.");}
return"";},_fileMappingValidate:function(itemId,data)
{var oldPathPrefix=itemId?this._entries[itemId].pathPrefix:null;return this._validateMapping(data["url"],itemId,data["path"],oldPathPrefix);},_fileMappingEdit:function(itemId,data)
{if(itemId){var urlPrefix=itemId;var pathPrefix=this._entries[itemId].pathPrefix;var fileSystemPath=this._entries[itemId].fileSystemPath;WebInspector.isolatedFileSystemManager.mapping().removeFileMapping(fileSystemPath,urlPrefix,pathPrefix);}
this._addFileMapping(data["url"],data["path"]);},_validateMapping:function(urlPrefix,allowedURLPrefix,path,allowedPathPrefix)
{var columns=[];if(!this._checkURLPrefix(urlPrefix,allowedURLPrefix))
columns.push("url");if(!this._checkPathPrefix(path,allowedPathPrefix))
columns.push("path");return columns;},_fileMappingRemovedfromList:function(event)
{var urlPrefix=(event.data);if(!urlPrefix)
return;var entry=this._entries[urlPrefix];WebInspector.isolatedFileSystemManager.mapping().removeFileMapping(entry.fileSystemPath,entry.urlPrefix,entry.pathPrefix);this._hasMappingChanges=true;},_addFileMapping:function(urlPrefix,pathPrefix)
{var normalizedURLPrefix=this._normalizePrefix(urlPrefix);var normalizedPathPrefix=this._normalizePrefix(pathPrefix);WebInspector.isolatedFileSystemManager.mapping().addFileMapping(this._fileSystemPath,normalizedURLPrefix,normalizedPathPrefix);this._hasMappingChanges=true;this._fileMappingsList.selectItem(normalizedURLPrefix);return true;},_normalizePrefix:function(prefix)
{if(!prefix)
return"";return prefix+(prefix[prefix.length-1]==="/"?"":"/");},_addMappingRow:function(entry)
{var fileSystemPath=entry.fileSystemPath;var urlPrefix=entry.urlPrefix;if(!this._fileSystemPath||this._fileSystemPath!==fileSystemPath)
return;this._entries[urlPrefix]=entry;var fileMappingListItem=this._fileMappingsList.addItem(urlPrefix,null);this._resize();},_excludedFolderAdded:function(event)
{var entry=(event.data);this._addExcludedFolderRow(entry);},_excludedFolderRemoved:function(event)
{var entry=(event.data);var fileSystemPath=entry.fileSystemPath;if(!fileSystemPath||this._fileSystemPath!==fileSystemPath)
return;delete this._excludedFolderEntries[entry.path];if(this._excludedFolderList.itemForId(entry.path))
this._excludedFolderList.removeItem(entry.path);},_excludedFolderValueProvider:function(itemId,columnId)
{return itemId;},_excludedFolderValidate:function(itemId,data)
{var fileSystemPath=this._fileSystemPath;var columns=[];if(!this._validateExcludedFolder(data["path"],itemId))
columns.push("path");return columns;},_validateExcludedFolder:function(path,allowedPath)
{return!!path&&(path===allowedPath||!this._excludedFolderEntries.contains(path));},_excludedFolderEdit:function(itemId,data)
{var fileSystemPath=this._fileSystemPath;if(itemId)
WebInspector.isolatedFileSystemManager.mapping().removeExcludedFolder(fileSystemPath,itemId);var excludedFolderPath=data["path"];WebInspector.isolatedFileSystemManager.mapping().addExcludedFolder(fileSystemPath,excludedFolderPath);},_excludedFolderRemovedfromList:function(event)
{var itemId=(event.data);if(!itemId)
return;WebInspector.isolatedFileSystemManager.mapping().removeExcludedFolder(this._fileSystemPath,itemId);},_addExcludedFolderRow:function(entry)
{var fileSystemPath=entry.fileSystemPath;if(!fileSystemPath||this._fileSystemPath!==fileSystemPath)
return;var path=entry.path;this._excludedFolderEntries.put(path,entry);this._excludedFolderList.addItem(path,null);this._resize();},_checkURLPrefix:function(value,allowedPrefix)
{var prefix=this._normalizePrefix(value);return!!prefix&&(prefix===allowedPrefix||!this._entries[prefix]);},_checkPathPrefix:function(value,allowedPrefix)
{var prefix=this._normalizePrefix(value);if(!prefix)
return false;if(prefix===allowedPrefix)
return true;for(var urlPrefix in this._entries){var entry=this._entries[urlPrefix];if(urlPrefix&&entry.pathPrefix===prefix)
return false;}
return true;},focus:function()
{WebInspector.setCurrentFocusElement(this.element);},_onDoneClick:function()
{WebInspector.Dialog.hide();},onEnter:function()
{},__proto__:WebInspector.DialogDelegate.prototype};WebInspector.FrameworkBlackboxDialog=function()
{WebInspector.DialogDelegate.call(this);this.element=document.createElementWithClass("div","blackbox-dialog dialog-contents");var header=this.element.createChild("div","header");header.createChild("span").textContent=WebInspector.UIString("Framework blackbox patterns");var closeButton=header.createChild("div","close-button-gray done-button");closeButton.addEventListener("click",this._onDoneClick.bind(this),false);var contents=this.element.createChild("div","contents");var blockHeader=contents.createChild("div","columns-header");blockHeader.createChild("span").textContent=WebInspector.UIString("URI pattern");blockHeader.createChild("span").textContent=WebInspector.UIString("Behavior");var section=contents.createChild("div","section");var container=section.createChild("div","settings-list-container");this._blackboxLabel=WebInspector.UIString("Blackbox");this._disabledLabel=WebInspector.UIString("Disabled");var column1={id:"pattern",placeholder:"/framework\\.js$"};var column2={id:"value",options:[this._blackboxLabel,this._disabledLabel]};this._patternsList=new WebInspector.EditableSettingsList([column1,column2],this._patternValuesProvider.bind(this),this._patternValidate.bind(this),this._patternEdit.bind(this));this._patternsList.element.classList.add("blackbox-patterns-list");this._patternsList.addEventListener(WebInspector.SettingsList.Events.Removed,this._patternRemovedFromList.bind(this));container.appendChild(this._patternsList.element);this._entries=new StringMap();var patterns=WebInspector.settings.skipStackFramesPattern.getAsArray();for(var i=0;i<patterns.length;++i)
this._addPattern(patterns[i].pattern,patterns[i].disabled);this.element.tabIndex=0;}
WebInspector.FrameworkBlackboxDialog.show=function(element)
{WebInspector.Dialog.show(element,new WebInspector.FrameworkBlackboxDialog());var glassPane=document.getElementById("glass-pane");glassPane.classList.add("settings-glass-pane");}
WebInspector.FrameworkBlackboxDialog.prototype={show:function(element)
{this._dialogElement=element;element.appendChild(this.element);element.classList.add("settings-dialog","settings-tab");},_resize:function()
{if(!this._dialogElement||!this._relativeToElement)
return;const minWidth=200;const minHeight=150;var maxHeight=this._relativeToElement.offsetHeight-10;maxHeight=Math.max(minHeight,maxHeight);var maxWidth=Math.min(540,this._relativeToElement.offsetWidth-10);maxWidth=Math.max(minWidth,maxWidth);this._dialogElement.style.maxHeight=maxHeight+"px";this._dialogElement.style.width=maxWidth+"px";WebInspector.DialogDelegate.prototype.position(this._dialogElement,this._relativeToElement);},position:function(element,relativeToElement)
{this._relativeToElement=relativeToElement;this._resize();},willHide:function(event)
{},_patternValuesProvider:function(itemId,columnId)
{if(!itemId)
return"";switch(columnId){case"pattern":return itemId;case"value":return(this._entries.get(itemId));default:console.assert("Should not be reached.");}
return"";},_patternValidate:function(itemId,data)
{var regex;var oldPattern=itemId;var newPattern=data["pattern"];try{if(newPattern&&(oldPattern===newPattern||!this._entries.contains(newPattern)))
regex=new RegExp(newPattern);}catch(e){}
return regex?[]:["pattern"];},_patternEdit:function(itemId,data)
{var oldPattern=itemId;var newPattern=data["pattern"];if(!newPattern)
return;var disabled=(data["value"]===this._disabledLabel);var patterns=WebInspector.settings.skipStackFramesPattern.getAsArray();for(var i=0;i<=patterns.length;++i){if(i===patterns.length){patterns.push({pattern:newPattern,disabled:disabled});break;}
if(patterns[i].pattern===oldPattern){patterns[i]={pattern:newPattern,disabled:disabled};break;}}
WebInspector.settings.skipStackFramesPattern.setAsArray(patterns);if(oldPattern&&oldPattern===newPattern){this._entries.put(newPattern,disabled?this._disabledLabel:this._blackboxLabel)
this._patternsList.itemForId(oldPattern).classList.toggle("disabled",disabled);this._patternsList.refreshItem(newPattern);return;}
if(oldPattern){this._patternsList.removeItem(oldPattern);this._entries.remove(oldPattern);}
this._addPattern(newPattern,disabled);},_patternRemovedFromList:function(event)
{var pattern=(event.data);if(!pattern)
return;this._entries.remove(pattern);var patterns=WebInspector.settings.skipStackFramesPattern.getAsArray();for(var i=0;i<patterns.length;++i){if(patterns[i].pattern===pattern){patterns.splice(i,1);break;}}
WebInspector.settings.skipStackFramesPattern.setAsArray(patterns);},_addPattern:function(pattern,disabled)
{if(!pattern||this._entries.contains(pattern))
return;this._entries.put(pattern,disabled?this._disabledLabel:this._blackboxLabel);var listItem=this._patternsList.addItem(pattern,null);listItem.classList.toggle("disabled",disabled);this._resize();},focus:function()
{WebInspector.setCurrentFocusElement(this.element);},_onDoneClick:function()
{WebInspector.Dialog.hide();},onEnter:function(event)
{var focusElement=WebInspector.currentFocusElement();var nodeName=focusElement&&focusElement.nodeName.toLowerCase();if(nodeName==="input"||nodeName==="select"){this.focus();event.consume(true);return;}},__proto__:WebInspector.DialogDelegate.prototype};WebInspector.SettingsScreen=function(onHide)
{WebInspector.HelpScreen.call(this);this.element.id="settings-screen";this._onHide=onHide;this._tabbedPane=new WebInspector.TabbedPane();this._tabbedPane.element.classList.add("help-window-main");var settingsLabelElement=document.createElementWithClass("div","help-window-label");settingsLabelElement.createTextChild(WebInspector.UIString("Settings"));this._tabbedPane.element.insertBefore(settingsLabelElement,this._tabbedPane.element.firstChild);this._tabbedPane.element.appendChild(this._createCloseButton());this._tabbedPane.appendTab(WebInspector.SettingsScreen.Tabs.General,WebInspector.UIString("General"),new WebInspector.GenericSettingsTab());this._tabbedPane.appendTab(WebInspector.SettingsScreen.Tabs.Workspace,WebInspector.UIString("Workspace"),new WebInspector.WorkspaceSettingsTab());if(WebInspector.experimentsSettings.experimentsEnabled)
this._tabbedPane.appendTab(WebInspector.SettingsScreen.Tabs.Experiments,WebInspector.UIString("Experiments"),new WebInspector.ExperimentsSettingsTab());this._tabbedPane.appendTab(WebInspector.SettingsScreen.Tabs.Shortcuts,WebInspector.UIString("Shortcuts"),WebInspector.shortcutsScreen.createShortcutsTabView());this._tabbedPane.shrinkableTabs=false;this._tabbedPane.verticalTabLayout=true;this._lastSelectedTabSetting=WebInspector.settings.createSetting("lastSelectedSettingsTab",WebInspector.SettingsScreen.Tabs.General);this.selectTab(this._lastSelectedTabSetting.get());this._tabbedPane.addEventListener(WebInspector.TabbedPane.EventTypes.TabSelected,this._tabSelected,this);this.element.addEventListener("keydown",this._keyDown.bind(this),false);this._developerModeCounter=0;}
WebInspector.SettingsScreen.integerValidator=function(min,max,text)
{var value=Number(text);if(isNaN(value))
return WebInspector.UIString("Invalid number format");if(value<min||value>max)
return WebInspector.UIString("Value is out of range [%d, %d]",min,max);return null;}
WebInspector.SettingsScreen.Tabs={General:"general",Overrides:"overrides",Workspace:"workspace",Experiments:"experiments",Shortcuts:"shortcuts"}
WebInspector.SettingsScreen.prototype={selectTab:function(tabId)
{this._tabbedPane.selectTab(tabId);},_tabSelected:function(event)
{this._lastSelectedTabSetting.set(this._tabbedPane.selectedTabId);},wasShown:function()
{this._tabbedPane.show(this.element);WebInspector.HelpScreen.prototype.wasShown.call(this);},isClosingKey:function(keyCode)
{return[WebInspector.KeyboardShortcut.Keys.Enter.code,WebInspector.KeyboardShortcut.Keys.Esc.code,].indexOf(keyCode)>=0;},willHide:function()
{this._onHide();WebInspector.HelpScreen.prototype.willHide.call(this);},_keyDown:function(event)
{var shiftKeyCode=16;if(event.keyCode===shiftKeyCode&&++this._developerModeCounter>5)
this.element.classList.add("settings-developer-mode");},__proto__:WebInspector.HelpScreen.prototype}
WebInspector.SettingsTab=function(name,id)
{WebInspector.VBox.call(this);this.element.classList.add("settings-tab-container");if(id)
this.element.id=id;var header=this.element.createChild("header");header.createChild("h3").createTextChild(name);this.containerElement=this.element.createChild("div","help-container-wrapper").createChild("div","settings-tab help-content help-container");}
WebInspector.SettingsTab.prototype={_appendSection:function(name)
{var block=this.containerElement.createChild("div","help-block");if(name)
block.createChild("div","help-section-title").textContent=name;return block;},_createSelectSetting:function(name,options,setting)
{var p=document.createElement("p");p.createChild("label").textContent=name;var select=p.createChild("select","chrome-select");var settingValue=setting.get();for(var i=0;i<options.length;++i){var option=options[i];select.add(new Option(option[0],option[1]));if(settingValue===option[1])
select.selectedIndex=i;}
function changeListener(e)
{setting.set(options[select.selectedIndex][1]);}
select.addEventListener("change",changeListener,false);return p;},__proto__:WebInspector.VBox.prototype}
WebInspector.GenericSettingsTab=function()
{WebInspector.SettingsTab.call(this,WebInspector.UIString("General"),"general-tab-content");this._populateSectionsFromExtensions();var restoreDefaults=this._appendSection().createChild("input","text-button");restoreDefaults.type="button";restoreDefaults.value=WebInspector.UIString("Restore defaults and reload");restoreDefaults.addEventListener("click",restoreAndReload,false);function restoreAndReload()
{if(window.localStorage)
window.localStorage.clear();WebInspector.reload();}}
WebInspector.GenericSettingsTab.prototype={_populateSectionsFromExtensions:function()
{var explicitSectionOrder=["","Appearance","Elements","Sources","Profiler","Console","Extensions"];var allExtensions=self.runtime.extensions("ui-setting");var extensionsBySectionId=new StringMultimap();var childSettingExtensionsByParentName=new StringMultimap();allExtensions.forEach(function(extension){var descriptor=extension.descriptor();var sectionName=descriptor["section"]||"";if(!sectionName&&descriptor["parentSettingName"]){childSettingExtensionsByParentName.put(descriptor["parentSettingName"],extension);return;}
extensionsBySectionId.put(sectionName,extension);});var sectionIds=extensionsBySectionId.keys();var explicitlyOrderedSections=explicitSectionOrder.keySet();for(var i=0;i<explicitSectionOrder.length;++i){var extensions=extensionsBySectionId.get(explicitSectionOrder[i]);if(!extensions.size())
continue;this._addSectionWithExtensionProvidedSettings(explicitSectionOrder[i],extensions.values(),childSettingExtensionsByParentName);}
for(var i=0;i<sectionIds.length;++i){if(explicitlyOrderedSections[sectionIds[i]])
continue;this._addSectionWithExtensionProvidedSettings(sectionIds[i],extensionsBySectionId.get(sectionIds[i]).values(),childSettingExtensionsByParentName);}},_addSectionWithExtensionProvidedSettings:function(sectionName,extensions,childSettingExtensionsByParentName)
{var uiSectionName=sectionName&&WebInspector.UIString(sectionName);var sectionElement=this._appendSection(uiSectionName);extensions.forEach(processSetting.bind(this,null));function processSetting(parentFieldset,extension)
{var descriptor=extension.descriptor();var experimentName=descriptor["experiment"];if(experimentName&&(!WebInspector.experimentsSettings[experimentName]||!WebInspector.experimentsSettings[experimentName].isEnabled()))
return;var settingName=descriptor["settingName"];var setting=WebInspector.settings[settingName];var instance=extension.instance();var settingControl;if(instance&&descriptor["settingType"]==="custom"){settingControl=instance.settingElement();if(!settingControl)
return;}
if(!settingControl){var uiTitle=WebInspector.UIString(descriptor["title"]);settingControl=createSettingControl.call(this,uiTitle,setting,descriptor,instance);}
if(settingName){var childSettings=childSettingExtensionsByParentName.get(settingName);if(childSettings.size()){var fieldSet=WebInspector.SettingsUI.createSettingFieldset(setting);settingControl.appendChild(fieldSet);childSettings.values().forEach(function(item){processSetting.call(this,fieldSet,item);},this);}}
var containerElement=parentFieldset||sectionElement;containerElement.appendChild(settingControl);}
function createSettingControl(uiTitle,setting,descriptor,instance)
{switch(descriptor["settingType"]){case"checkbox":return WebInspector.SettingsUI.createSettingCheckbox(uiTitle,setting);case"select":var descriptorOptions=descriptor["options"]
var options=new Array(descriptorOptions.length);for(var i=0;i<options.length;++i){var optionName=descriptorOptions[i][2]?descriptorOptions[i][0]:WebInspector.UIString(descriptorOptions[i][0]);options[i]=[WebInspector.UIString(descriptorOptions[i][0]),descriptorOptions[i][1]];}
return this._createSelectSetting(uiTitle,options,setting);default:throw"Invalid setting type: "+descriptor["settingType"];}}},__proto__:WebInspector.SettingsTab.prototype}
WebInspector.SettingsScreen.SkipStackFramePatternSettingDelegate=function()
{WebInspector.UISettingDelegate.call(this);}
WebInspector.SettingsScreen.SkipStackFramePatternSettingDelegate.prototype={settingElement:function()
{var button=document.createElementWithClass("input","text-button");button.type="button";button.value=WebInspector.manageBlackboxingButtonLabel();button.title=WebInspector.UIString("Skip stepping through sources with particular names");button.addEventListener("click",this._onManageButtonClick.bind(this),false);return button;},_onManageButtonClick:function()
{WebInspector.FrameworkBlackboxDialog.show(WebInspector.inspectorView.element);},__proto__:WebInspector.UISettingDelegate.prototype}
WebInspector.WorkspaceSettingsTab=function()
{WebInspector.SettingsTab.call(this,WebInspector.UIString("Workspace"),"workspace-tab-content");WebInspector.isolatedFileSystemManager.addEventListener(WebInspector.IsolatedFileSystemManager.Events.FileSystemAdded,this._fileSystemAdded,this);WebInspector.isolatedFileSystemManager.addEventListener(WebInspector.IsolatedFileSystemManager.Events.FileSystemRemoved,this._fileSystemRemoved,this);this._commonSection=this._appendSection(WebInspector.UIString("Common"));var folderExcludePatternInput=WebInspector.SettingsUI.createSettingInputField(WebInspector.UIString("Folder exclude pattern"),WebInspector.settings.workspaceFolderExcludePattern,false,0,"270px",WebInspector.SettingsUI.regexValidator);this._commonSection.appendChild(folderExcludePatternInput);this._fileSystemsSection=this._appendSection(WebInspector.UIString("Folders"));this._fileSystemsListContainer=this._fileSystemsSection.createChild("p","settings-list-container");this._addFileSystemRowElement=this._fileSystemsSection.createChild("div");var addFileSystemButton=this._addFileSystemRowElement.createChild("input","text-button");addFileSystemButton.type="button";addFileSystemButton.value=WebInspector.UIString("Add folder\u2026");addFileSystemButton.addEventListener("click",this._addFileSystemClicked.bind(this),false);this._editFileSystemButton=this._addFileSystemRowElement.createChild("input","text-button");this._editFileSystemButton.type="button";this._editFileSystemButton.value=WebInspector.UIString("Folder options\u2026");this._editFileSystemButton.addEventListener("click",this._editFileSystemClicked.bind(this),false);this._updateEditFileSystemButtonState();this._reset();}
WebInspector.WorkspaceSettingsTab.prototype={wasShown:function()
{WebInspector.SettingsTab.prototype.wasShown.call(this);this._reset();},_reset:function()
{this._resetFileSystems();},_resetFileSystems:function()
{this._fileSystemsListContainer.removeChildren();var fileSystemPaths=WebInspector.isolatedFileSystemManager.mapping().fileSystemPaths();delete this._fileSystemsList;if(!fileSystemPaths.length){var noFileSystemsMessageElement=this._fileSystemsListContainer.createChild("div","no-file-systems-message");noFileSystemsMessageElement.textContent=WebInspector.UIString("You have no file systems added.");return;}
this._fileSystemsList=new WebInspector.SettingsList([{id:"path"}],this._renderFileSystem.bind(this));this._fileSystemsList.element.classList.add("file-systems-list");this._fileSystemsList.addEventListener(WebInspector.SettingsList.Events.Selected,this._fileSystemSelected.bind(this));this._fileSystemsList.addEventListener(WebInspector.SettingsList.Events.Removed,this._fileSystemRemovedfromList.bind(this));this._fileSystemsList.addEventListener(WebInspector.SettingsList.Events.DoubleClicked,this._fileSystemDoubleClicked.bind(this));this._fileSystemsListContainer.appendChild(this._fileSystemsList.element);for(var i=0;i<fileSystemPaths.length;++i)
this._fileSystemsList.addItem(fileSystemPaths[i]);this._updateEditFileSystemButtonState();},_updateEditFileSystemButtonState:function()
{this._editFileSystemButton.disabled=!this._selectedFileSystemPath();},_fileSystemSelected:function(event)
{this._updateEditFileSystemButtonState();},_fileSystemDoubleClicked:function(event)
{var id=(event.data);this._editFileSystem(id);},_editFileSystemClicked:function()
{this._editFileSystem(this._selectedFileSystemPath());},_editFileSystem:function(id)
{WebInspector.EditFileSystemDialog.show(WebInspector.inspectorView.element,id);},_renderFileSystem:function(columnElement,column,id)
{if(!id)
return"";var fileSystemPath=id;var textElement=columnElement.createChild("span","list-column-text");var pathElement=textElement.createChild("span","file-system-path");pathElement.title=fileSystemPath;const maxTotalPathLength=55;const maxFolderNameLength=30;var lastIndexOfSlash=fileSystemPath.lastIndexOf(WebInspector.isWin()?"\\":"/");var folderName=fileSystemPath.substr(lastIndexOfSlash+1);var folderPath=fileSystemPath.substr(0,lastIndexOfSlash+1);folderPath=folderPath.trimMiddle(maxTotalPathLength-Math.min(maxFolderNameLength,folderName.length));folderName=folderName.trimMiddle(maxFolderNameLength);var folderPathElement=pathElement.createChild("span");folderPathElement.textContent=folderPath;var nameElement=pathElement.createChild("span","file-system-path-name");nameElement.textContent=folderName;},_fileSystemRemovedfromList:function(event)
{var id=(event.data);if(!id)
return;WebInspector.isolatedFileSystemManager.removeFileSystem(id);},_addFileSystemClicked:function()
{WebInspector.isolatedFileSystemManager.addFileSystem();},_fileSystemAdded:function(event)
{var fileSystem=(event.data);if(!this._fileSystemsList)
this._reset();else
this._fileSystemsList.addItem(fileSystem.path());},_fileSystemRemoved:function(event)
{var fileSystem=(event.data);var selectedFileSystemPath=this._selectedFileSystemPath();if(this._fileSystemsList.itemForId(fileSystem.path()))
this._fileSystemsList.removeItem(fileSystem.path());if(!this._fileSystemsList.itemIds().length)
this._reset();this._updateEditFileSystemButtonState();},_selectedFileSystemPath:function()
{return this._fileSystemsList?this._fileSystemsList.selectedId():null;},__proto__:WebInspector.SettingsTab.prototype}
WebInspector.ExperimentsSettingsTab=function()
{WebInspector.SettingsTab.call(this,WebInspector.UIString("Experiments"),"experiments-tab-content");var experiments=WebInspector.experimentsSettings.experiments;if(experiments.length){var experimentsSection=this._appendSection();experimentsSection.appendChild(this._createExperimentsWarningSubsection());for(var i=0;i<experiments.length;++i)
experimentsSection.appendChild(this._createExperimentCheckbox(experiments[i]));}}
WebInspector.ExperimentsSettingsTab.prototype={_createExperimentsWarningSubsection:function()
{var subsection=document.createElement("div");var warning=subsection.createChild("span","settings-experiments-warning-subsection-warning");warning.textContent=WebInspector.UIString("WARNING:");subsection.createTextChild(" ");var message=subsection.createChild("span","settings-experiments-warning-subsection-message");message.textContent=WebInspector.UIString("These experiments could be dangerous and may require restart.");return subsection;},_createExperimentCheckbox:function(experiment)
{var input=document.createElement("input");input.type="checkbox";input.name=experiment.name;input.checked=experiment.isEnabled();function listener()
{experiment.setEnabled(input.checked);}
input.addEventListener("click",listener,false);var p=document.createElement("p");p.className=experiment.hidden&&!experiment.isEnabled()?"settings-experiment-hidden":"";var label=p.createChild("label");label.appendChild(input);label.createTextChild(WebInspector.UIString(experiment.title));p.appendChild(label);return p;},__proto__:WebInspector.SettingsTab.prototype}
WebInspector.SettingsController=function()
{this._settingsScreen;window.addEventListener("resize",this._resize.bind(this),false);}
WebInspector.SettingsController.prototype={_onHideSettingsScreen:function()
{delete this._settingsScreenVisible;},showSettingsScreen:function(tabId)
{if(!this._settingsScreen)
this._settingsScreen=new WebInspector.SettingsScreen(this._onHideSettingsScreen.bind(this));if(tabId)
this._settingsScreen.selectTab(tabId);this._settingsScreen.showModal();this._settingsScreenVisible=true;},_resize:function()
{if(this._settingsScreen&&this._settingsScreen.isShowing())
this._settingsScreen.doResize();}}
WebInspector.SettingsController.SettingsScreenActionDelegate=function(){}
WebInspector.SettingsController.SettingsScreenActionDelegate.prototype={handleAction:function()
{WebInspector._settingsController.showSettingsScreen(WebInspector.SettingsScreen.Tabs.General);return true;}}
WebInspector.SettingsList=function(columns,itemRenderer)
{this.element=document.createElementWithClass("div","settings-list");this.element.tabIndex=-1;this._itemRenderer=itemRenderer;this._listItems=new StringMap();this._ids=[];this._columns=columns;}
WebInspector.SettingsList.Events={Selected:"Selected",Removed:"Removed",DoubleClicked:"DoubleClicked",}
WebInspector.SettingsList.prototype={addItem:function(itemId,beforeId)
{var listItem=document.createElementWithClass("div","settings-list-item");listItem._id=itemId;if(typeof beforeId!=="undefined")
this.element.insertBefore(listItem,this.itemForId(beforeId));else
this.element.appendChild(listItem);var listItemContents=listItem.createChild("div","settings-list-item-contents");var listItemColumnsElement=listItemContents.createChild("div","settings-list-item-columns");listItem.columnElements={};for(var i=0;i<this._columns.length;++i){var column=this._columns[i];var columnElement=listItemColumnsElement.createChild("div","list-column settings-list-column-"+column.id);listItem.columnElements[column.id]=columnElement;this._itemRenderer(columnElement,column,itemId);}
var removeItemButton=this._createRemoveButton(removeItemClicked.bind(this));listItemContents.addEventListener("click",this.selectItem.bind(this,itemId),false);listItemContents.addEventListener("dblclick",this._onDoubleClick.bind(this,itemId),false);listItemContents.appendChild(removeItemButton);this._listItems.put(itemId||"",listItem);if(typeof beforeId!=="undefined")
this._ids.splice(this._ids.indexOf(beforeId),0,itemId);else
this._ids.push(itemId);function removeItemClicked(event)
{removeItemButton.disabled=true;this.removeItem(itemId);this.dispatchEventToListeners(WebInspector.SettingsList.Events.Removed,itemId);event.consume();}
return listItem;},removeItem:function(id)
{var listItem=this._listItems.remove(id||"");if(listItem)
listItem.remove();this._ids.remove(id);if(id===this._selectedId){delete this._selectedId;if(this._ids.length)
this.selectItem(this._ids[0]);}},itemIds:function()
{return this._ids.slice();},columns:function()
{return this._columns.select("id");},selectedId:function()
{return this._selectedId;},selectedItem:function()
{return this._selectedId?this.itemForId(this._selectedId):null;},itemForId:function(itemId)
{return this._listItems.get(itemId||"")||null;},_onDoubleClick:function(id,event)
{this.dispatchEventToListeners(WebInspector.SettingsList.Events.DoubleClicked,id);},selectItem:function(id,event)
{if(typeof this._selectedId!=="undefined")
this.itemForId(this._selectedId).classList.remove("selected");this._selectedId=id;if(typeof this._selectedId!=="undefined")
this.itemForId(this._selectedId).classList.add("selected");this.dispatchEventToListeners(WebInspector.SettingsList.Events.Selected,id);if(event)
event.consume();},_createRemoveButton:function(handler)
{var removeButton=document.createElementWithClass("div","remove-item-button");removeButton.addEventListener("click",handler,false);return removeButton;},__proto__:WebInspector.Object.prototype}
WebInspector.EditableSettingsList=function(columns,valuesProvider,validateHandler,editHandler)
{WebInspector.SettingsList.call(this,columns,this._renderColumn.bind(this));this._valuesProvider=valuesProvider;this._validateHandler=validateHandler;this._editHandler=editHandler;this._addInputElements=new StringMap();this._editInputElements=new StringMap();this._textElements=new StringMap();this._addMappingItem=this.addItem(null);this._addMappingItem.classList.add("item-editing","add-list-item");}
WebInspector.EditableSettingsList.prototype={addItem:function(itemId,beforeId)
{var listItem=WebInspector.SettingsList.prototype.addItem.call(this,itemId,beforeId);listItem.classList.add("editable");return listItem;},refreshItem:function(itemId)
{if(!itemId)
return;var listItem=this.itemForId(itemId);if(!listItem)
return;for(var i=0;i<this._columns.length;++i){var column=this._columns[i];var columnId=column.id;var value=this._valuesProvider(itemId,columnId);var textElement=this._textElements.get(itemId).get(columnId);textElement.textContent=value;textElement.title=value;var editElement=this._editInputElements.get(itemId).get(columnId);this._setEditElementValue(editElement,value||"");}},_renderColumn:function(columnElement,column,itemId)
{var columnId=column.id;if(itemId===null){this._createEditElement(columnElement,column,itemId);return;}
var validItemId=itemId;if(!this._editInputElements.contains(itemId))
this._editInputElements.put(itemId,new StringMap());if(!this._textElements.contains(itemId))
this._textElements.put(itemId,new StringMap());var value=this._valuesProvider(itemId,columnId);var textElement=(columnElement.createChild("span","list-column-text"));textElement.textContent=value;textElement.title=value;columnElement.addEventListener("click",rowClicked.bind(this),false);this._textElements.get(itemId).put(columnId,textElement);this._createEditElement(columnElement,column,itemId,value);function rowClicked(event)
{if(itemId===this._editingId)
return;event.consume();console.assert(!this._editingId);this._editingId=validItemId;var listItem=this.itemForId(validItemId);listItem.classList.add("item-editing");var editElement=event.target.editElement||this._editInputElements.get(validItemId).get(this.columns()[0]);editElement.focus();if(editElement.select)
editElement.select();}},_createEditElement:function(columnElement,column,itemId,value)
{var options=column.options;if(options){var editElement=(columnElement.createChild("select","chrome-select list-column-editor"));for(var i=0;i<options.length;++i){var option=editElement.createChild("option");option.value=options[i];option.textContent=options[i];}
editElement.addEventListener("blur",this._editMappingBlur.bind(this,itemId),false);editElement.addEventListener("change",this._editMappingBlur.bind(this,itemId),false);}else{var editElement=(columnElement.createChild("input","list-column-editor"));editElement.addEventListener("blur",this._editMappingBlur.bind(this,itemId),false);editElement.addEventListener("input",this._validateEdit.bind(this,itemId),false);if(itemId===null)
editElement.placeholder=column.placeholder||"";}
if(itemId===null)
this._addInputElements.put(column.id,editElement);else
this._editInputElements.get(itemId).put(column.id,editElement);this._setEditElementValue(editElement,value||"");columnElement.editElement=editElement;return editElement;},_setEditElementValue:function(editElement,value)
{if(!editElement)
return;if(editElement instanceof HTMLSelectElement){var options=editElement.options;for(var i=0;i<options.length;++i)
options[i].selected=(options[i].value===value);}else{editElement.value=value;}},_data:function(itemId)
{var inputElements=this._inputElements(itemId);var data={__proto__:null};var columns=this.columns();for(var i=0;i<columns.length;++i)
data[columns[i]]=inputElements.get(columns[i]).value;return data;},_inputElements:function(itemId)
{if(!itemId)
return this._addInputElements;return this._editInputElements.get(itemId)||null;},_validateEdit:function(itemId)
{var errorColumns=this._validateHandler(itemId,this._data(itemId));var hasChanges=this._hasChanges(itemId);var columns=this.columns();for(var i=0;i<columns.length;++i){var columnId=columns[i];var inputElement=this._inputElements(itemId).get(columnId);if(hasChanges&&errorColumns.indexOf(columnId)!==-1)
inputElement.classList.add("editable-item-error");else
inputElement.classList.remove("editable-item-error");}
return!errorColumns.length;},_hasChanges:function(itemId)
{var columns=this.columns();for(var i=0;i<columns.length;++i){var columnId=columns[i];var oldValue=itemId?this._textElements.get(itemId).get(columnId).textContent:"";var newValue=this._inputElements(itemId).get(columnId).value;if(oldValue!==newValue)
return true;}
return false;},_editMappingBlur:function(itemId,event)
{if(itemId===null){this._onAddMappingInputBlur(event);return;}
var inputElements=this._editInputElements.get(itemId).values();if(inputElements.indexOf(event.relatedTarget)!==-1)
return;var listItem=this.itemForId(itemId);listItem.classList.remove("item-editing");delete this._editingId;if(!this._hasChanges(itemId))
return;if(!this._validateEdit(itemId)){var columns=this.columns();for(var i=0;i<columns.length;++i){var columnId=columns[i];var editElement=this._editInputElements.get(itemId).get(columnId);this._setEditElementValue(editElement,this._textElements.get(itemId).get(columnId).textContent);editElement.classList.remove("editable-item-error");}
return;}
this._editHandler(itemId,this._data(itemId));},_onAddMappingInputBlur:function(event)
{var inputElements=this._addInputElements.values();if(inputElements.indexOf(event.relatedTarget)!==-1)
return;if(!this._hasChanges(null))
return;if(!this._validateEdit(null))
return;this._editHandler(null,this._data(null));var columns=this.columns();for(var i=0;i<columns.length;++i){var columnId=columns[i];var editElement=this._addInputElements.get(columnId);this._setEditElementValue(editElement,"");}},__proto__:WebInspector.SettingsList.prototype}
WebInspector._settingsController=new WebInspector.SettingsController();;