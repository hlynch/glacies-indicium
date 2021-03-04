import os
from typing import Any
from flask import Flask, render_template, current_app, Blueprint, json, jsonify, send_file, request, Response


client_api = Blueprint('client_api', 'terracotta.client')


@client_api.route('/', methods=['GET'])
def get_map() -> Any:
    return render_template(
        'app.html', hostname=current_app.config['terracotta_hostname']
    )


@client_api.route('/exportFile/', methods=['POST'])
def export_tif_file() -> Any:
    regionId = request.form['regionId'].split('/')
    fileName = 'WV02' + regionId[0] + "_ds_" + regionId[1] + ".tif"
    geotiffFolder = os.getcwd() + '/cluster/test.txt'
    geotiffFolder = 'file:///' + geotiffFolder
    print(geotiffFolder)
    return geotiffFolder
    # return send_file(geotiffFolder, mimetype='text/plain', attachment_filename='test.txt', as_attachment=True)


'''
Testing for exporting
@client_api.route('/<band_id>/<region_id>/', methods=['GET', 'POST'])
def getFile(band_id, region_id):
    print(band_id)
    print(region_id)
    geotiffFolder = os.getcwd() + '/cluster/test.txt'

    return send_file(geotiffFolder, as_attachment=True)
'''


@client_api.route('/getJsonFile/<jsonFile>', methods=['GET'])
def getBandNames(jsonFile):
    print(jsonFile)
    filename = os.path.join(current_app.static_folder, 'data', jsonFile + '.json')
    with open(filename) as json_file:
        data = json.load(json_file)

    return jsonify(data)


def create_app(hostname: str) -> Flask:
    client_app = Flask('terracotta.client')
    client_app.config['terracotta_hostname'] = hostname
    client_app.register_blueprint(client_api)
    return client_app
