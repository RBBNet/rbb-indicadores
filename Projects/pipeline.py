import pandas as pd
from datetime import datetime
import warnings

"""
Função para filtrar o dataframe contendo 
os eventos de timeline e as issues.
Mantém apenas uma ocorrência 
de maior valor por mês,
"""
def filter_merged_df(merged_df):
	

    merged_df['event_created_at'] = pd.to_datetime(merged_df['event_created_at'])
    merged_df['month'] = merged_df['event_created_at'].dt.to_period('M')
    merged_df = merged_df.sort_values(by=['issue_id', 'month', 'progress'], ascending=[True, True, False])

    filtered_df = merged_df.drop_duplicates(subset=['iniciativa_id', 'month'], keep='first')
    filtered_df = filtered_df.drop(columns=['month'])

    return filtered_df

"""
Função para interpretar a coluna de IDs das iniciativas
"""
def fetchIDs(iniciativa_id):
	IDs = (((iniciativa_id.replace("][", "#")).replace("[","#")).replace("]","#")).split("#")[1:3]

	return IDs

def load_files():
	print("\nAcessando arquivos com metadados...")

	files = ['./tmp/Indicadores.xlsx', './tmp/issues.csv', './tmp/timeline.csv']
	
	for file in files:
		print(f' - {file}')

	iniciativas = pd.read_excel(files[0], sheet_name='Andamento Iniciativas', engine='openpyxl')
	issues = pd.read_csv(files[1], sep=';')
	timeline = pd.read_csv(files[2], sep=';')

	return iniciativas, issues, timeline
	
"""
Se não há eventos de timeline para as issues encontradas:
	- Marcar o mês corrente como sem progresso, código -1.
Se há eventos de timeline para as issues encontradas, buscar progresso:
	-1: Progresso não encontrado, #andamento não encontrada.
		1: Nenhuma issue associada ao ID, ou nenhum ID associado à issue.
		2: Progresso encontrado, #andamento encontrada.
"""
def main():
	warnings.filterwarnings("ignore", category=UserWarning)

	iniciativas, issues, timeline = load_files()

	print("\nMerging issues e timeline...")
	merged_issues_timeline = pd.merge(timeline, issues, on='issue_id', how='left')

	colunas = pd.to_datetime(iniciativas.columns[3:])

	if merged_issues_timeline.empty:
		print(' - Nenhum evento de timeline encontrado. Issues sem reports de evolução')

		for index_iniciativa, iniciativa_id in iniciativas['ID'].items():
			if pd.isna(iniciativa_id):
				continue
			
			IDs = fetchIDs(str(iniciativa_id))
			
			if IDs.__len__() == 2:
				for index, row in issues.iterrows():
					title = str(row['title'])

					if (f'[{IDs[0]}]' in title) and (f'[{IDs[1]}]' in title):
						for date in colunas:
								if date.month == datetime.now().month:
									iniciativas.loc[index_iniciativa, date] = -1

		iniciativas.to_csv('./tmp/iniciativas_updated.csv',sep =';', index=False)
		
	else:
		merged_issues_timeline['iniciativa_id'] = ''
		merged_issues_timeline['progress'] = 0

		print("\nBuscando Progresso nas Issues...")
		
		for iniciativa_id in iniciativas['ID']:
			if pd.isna(iniciativa_id):
				continue
			
			IDs = fetchIDs(str(iniciativa_id))
			
			if IDs.__len__() == 2:
				for index, row in merged_issues_timeline.iterrows():
					title = str(row['title'])
					if (f'[{IDs[0]}]' in title) and (f'[{IDs[1]}]' in title):
						if '#andamento' in row['body']:
							merged_issues_timeline.at[index, 'iniciativa_id'] = iniciativa_id
							merged_issues_timeline.loc[index, 'progress'] = 2
						else:
							merged_issues_timeline.at[index, 'iniciativa_id'] = iniciativa_id
							merged_issues_timeline.loc[index, 'progress'] = -1
		
		filtered_df = filter_merged_df(merged_issues_timeline)
		
		for iniciativa_id in iniciativas['ID']:
			if pd.isna(iniciativa_id):
				continue
			hasPair = False
			for index, row in filtered_df.iterrows():
				if iniciativa_id == row['iniciativa_id']:
					hasPair = True
					iniciativa_index = iniciativas[iniciativas['ID'] == row['iniciativa_id']].index[0]
					event_creation = datetime.fromisoformat(str(row['event_created_at']))

					for date in colunas:
						if date.month == event_creation.month and date.year == event_creation.year:
							print(f"- Atualizando iniciativa com ID {iniciativa_id} no mês: {date.month}/{date.year}")
							iniciativas.loc[iniciativa_index, date] = row['progress']
							break

			if not hasPair:
				print(f"- Nenhuma issue associada ao ID {iniciativa_id}.")
				iniciativa_index = iniciativas[iniciativas['ID'] == iniciativa_id].index[0]
				for date in colunas:
					if date.month == datetime.now().month:
						iniciativas.loc[iniciativa_index, date] = -1
					  
	# atualizar arquivos com metadados das iniciativas
	resultFileName = './result/iniciativas_updated.csv'

	print(f'\nSalvando alterações nas Iniciativas no arquivo: {resultFileName}')

	iniciativas.to_csv(resultFileName,sep =';', index=False)

main()